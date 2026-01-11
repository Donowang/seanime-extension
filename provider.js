/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {
    // Configuration avec valeurs par défaut
    private baseUrl = "{{baseUrl}}" || "https://tenshitv.com";
    private useChromeDP = {{useChromeDP}} === "true";
    
    // Headers pour les requêtes
    private headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": this.baseUrl,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    };

    getSettings() {
        return {
            episodeServers: ["default", "tenshi", "streamtape", "vidcloud"],
            supportsDub: false
        };
    }

    // ==================== MÉTHODES UTILITAIRES ====================
    
    private resolveUrl(url) {
        if (!url) return "";
        if (url.startsWith("http")) return url;
        if (url.startsWith("//")) return `https:${url}`;
        if (url.startsWith("/")) return `${this.baseUrl}${url}`;
        return `${this.baseUrl}/${url}`;
    }

    private extractEpisodeNumber(text) {
        // Extrait le numéro d'épisode de différents formats
        const patterns = [
            /Episode\s*(\d+)/i,
            /Ep\.?\s*(\d+)/i,
            /Eps?\.?\s*(\d+)/i,
            /(\d+)\s*(?:VOSTFR|VF|SUB|DUB)/i,
            /#(\d+)/,
            /^(\d+)$/
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return parseInt(match[1], 10);
            }
        }
        
        // Fallback: extraire le premier nombre trouvé
        const numberMatch = text.match(/(\d+)/);
        return numberMatch ? parseInt(numberMatch[1], 10) : 0;
    }

    private async fetchWithRetry(url, options = {}, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: { ...this.headers, ...options.headers }
                });
                
                if (response.ok) return response;
                
                if (response.status === 429) { // Too Many Requests
                    await $sleep(2000 * (i + 1)); // Wait longer each retry
                    continue;
                }
                
                if (response.status >= 500) {
                    await $sleep(1000 * (i + 1));
                    continue;
                }
                
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                
            } catch (error) {
                if (i === retries - 1) throw error;
                await $sleep(1000 * (i + 1));
            }
        }
    }

    // ==================== RECHERCHE ====================
    
    async search(opts) {
        console.log(`[TenshiTV] Searching for: "${opts.query}"`);
        
        try {
            // Essayer différentes URL de recherche
            const searchUrls = [
                `${this.baseUrl}/search?q=${encodeURIComponent(opts.query)}`,
                `${this.baseUrl}/search.html?keyword=${encodeURIComponent(opts.query)}`,
                `${this.baseUrl}/?s=${encodeURIComponent(opts.query)}`,
                `${this.baseUrl}/anime?search=${encodeURIComponent(opts.query)}`
            ];
            
            let html = "";
            let successfulUrl = "";
            
            // Essayer chaque URL jusqu'à ce qu'une fonctionne
            for (const url of searchUrls) {
                try {
                    const response = await this.fetchWithRetry(url);
                    if (response.ok) {
                        html = await response.text();
                        successfulUrl = url;
                        break;
                    }
                } catch (error) {
                    console.log(`[TenshiTV] Search URL failed: ${url}`);
                }
            }
            
            if (!html) {
                console.error("[TenshiTV] All search URLs failed");
                return [];
            }
            
            const $ = LoadDoc(html);
            const results = [];
            
            // Sélecteurs communs pour les résultats de recherche
            const selectors = [
                ".video-item a", 
                ".anime-item a", 
                ".list-video .item a",
                ".film-list a",
                ".items a",
                "article a",
                ".post a",
                "a[href*='/anime/']",
                "a[href*='/videos/']"
            ];
            
            for (const selector of selectors) {
                $(selector).each((_, element) => {
                    const $el = $(element);
                    const href = $el.attr("href");
                    let title = $el.attr("title") || $el.text().trim();
                    
                    // Nettoyer le titre
                    title = title.replace(/\s*-\s*TenshiTV\s*$/i, "")
                                 .replace(/\s*VOSTFR\s*$/i, "")
                                 .replace(/\s*VF\s*$/i, "")
                                 .trim();
                    
                    if (href && title && title.length > 0) {
                        const fullUrl = this.resolveUrl(href);
                        const existing = results.find(r => r.url === fullUrl);
                        
                        if (!existing) {
                            results.push({
                                id: fullUrl,
                                title: title,
                                url: fullUrl,
                                subOrDub: "sub"
                            });
                        }
                    }
                });
                
                if (results.length > 0) break; // Arrêter au premier sélecteur qui fonctionne
            }
            
            console.log(`[TenshiTV] Found ${results.length} results`);
            return results.slice(0, 20); // Limiter à 20 résultats
            
        } catch (error) {
            console.error("[TenshiTV] Search error:", error);
            return [];
        }
    }

    // ==================== LISTE DES ÉPISODES ====================
    
    async findEpisodes(id) {
        console.log(`[TenshiTV] Finding episodes for: ${id}`);
        
        try {
            let html = "";
            
            if (this.useChromeDP) {
                // Utiliser ChromeDP pour les sites avec JavaScript
                const browser = await ChromeDP.newBrowser();
                await browser.navigate(id);
                await $sleep(3000); // Attendre le chargement JS
                html = await browser.html();
                await browser.close();
            } else {
                const response = await this.fetchWithRetry(id);
                html = await response.text();
            }
            
            const $ = LoadDoc(html);
            const episodes = [];
            
            // Chercher la liste des épisodes
            const episodeContainers = [
                "#episode-list",
                ".episode-list",
                ".list-episodes",
                ".episodes",
                "#episodes",
                ".eps"
            ];
            
            let episodeContainer = null;
            for (const selector of episodeContainers) {
                episodeContainer = $(selector);
                if (episodeContainer.length > 0) break;
            }
            
            if (!episodeContainer || episodeContainer.length === 0) {
                // Essayer de trouver des épisodes directement dans la page
                episodeContainer = $("body");
            }
            
            // Sélecteurs pour les liens d'épisodes
            episodeContainer.find("a").each((_, element) => {
                const $el = $(element);
                const href = $el.attr("href");
                const text = $el.text().trim();
                
                if (!href || !text) return;
                
                // Vérifier si c'est un lien d'épisode
                const isEpisode = href.match(/(episode|ep|eps?|video|watch|voir|stream)/i) ||
                                 text.match(/(episode|ep|eps?|#)/i) ||
                                 href.match(/\/\d+$/);
                
                if (isEpisode) {
                    const fullUrl = this.resolveUrl(href);
                    const epNumber = this.extractEpisodeNumber(text);
                    
                    if (epNumber > 0) {
                        episodes.push({
                            id: `${id}|${epNumber}|${fullUrl}`,
                            number: epNumber,
                            url: fullUrl,
                            title: `Episode ${epNumber}`
                        });
                    }
                }
            });
            
            // Si pas d'épisodes trouvés, chercher dans les données structurées
            if (episodes.length === 0) {
                const scriptTags = $("script[type='application/ld+json']");
                scriptTags.each((_, script) => {
                    try {
                        const data = JSON.parse($(script).html());
                        if (data.episode) {
                            const epNumber = this.extractEpisodeNumber(data.episode.name || "");
                            if (epNumber > 0) {
                                episodes.push({
                                    id: `${id}|${epNumber}|${data.url}`,
                                    number: epNumber,
                                    url: this.resolveUrl(data.url),
                                    title: data.episode.name || `Episode ${epNumber}`
                                });
                            }
                        }
                    } catch (e) {
                        // Ignorer les erreurs de parsing JSON
                    }
                });
            }
            
            // Supprimer les doublons et trier
            const uniqueEpisodes = [];
            const seen = new Set();
            
            for (const ep of episodes) {
                if (!seen.has(ep.number)) {
                    seen.add(ep.number);
                    uniqueEpisodes.push(ep);
                }
            }
            
            uniqueEpisodes.sort((a, b) => a.number - b.number);
            
            console.log(`[TenshiTV] Found ${uniqueEpisodes.length} episodes`);
            return uniqueEpisodes;
            
        } catch (error) {
            console.error("[TenshiTV] Find episodes error:", error);
            return [];
        }
    }

    // ==================== LECTEUR VIDÉO ====================
    
    async findEpisodeServer(episode, server) {
        console.log(`[TenshiTV] Finding video for episode: ${episode.url}`);
        
        try {
            let html = "";
            
            if (this.useChromeDP) {
                const browser = await ChromeDP.newBrowser();
                await browser.navigate(episode.url);
                await $sleep(4000); // Attendre le chargement du lecteur
                html = await browser.html();
                await browser.close();
            } else {
                const response = await this.fetchWithRetry(episode.url);
                html = await response.text();
            }
            
            const videoSources = [];
            let subtitles = [];
            
            // === STRATÉGIE 1: Extraire les sources vidéo ===
            
            // 1A. Rechercher des iframes (embed)
            const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
            let iframeMatch;
            while ((iframeMatch = iframeRegex.exec(html)) !== null) {
                const iframeUrl = this.resolveUrl(iframeMatch[1]);
                if (iframeUrl.includes("stream") || iframeUrl.includes("video") || iframeUrl.includes("embed")) {
                    videoSources.push({
                        url: iframeUrl,
                        type: "iframe",
                        quality: "default",
                        label: "Embed"
                    });
                }
            }
            
            // 1B. Rechercher des sources vidéo directes (m3u8, mp4)
            const videoRegexes = [
                /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi,
                /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/gi,
                /source\s+src=["']([^"']+)["']/gi,
                /file:\s*["']([^"']+)["']/gi,
                /sources:\s*\[[^\]]*["']([^"']+)["']/gi
            ];
            
            for (const regex of videoRegexes) {
                let match;
                while ((match = regex.exec(html)) !== null) {
                    const videoUrl = this.resolveUrl(match[1]);
                    if (videoUrl.includes("m3u8") || videoUrl.includes("mp4")) {
                        const quality = videoUrl.match(/(\d{3,4})[pP]/)?.[1] || "720";
                        videoSources.push({
                            url: videoUrl,
                            type: videoUrl.includes("m3u8") ? "m3u8" : "mp4",
                            quality: `${quality}p`,
                            label: `${quality}p`
                        });
                    }
                }
            }
            
            // 1C. Analyser les balises video HTML5
            const $ = LoadDoc(html);
            $("video source").each((_, element) => {
                const $el = $(element);
                const src = $el.attr("src");
                const type = $el.attr("type");
                
                if (src) {
                    const videoUrl = this.resolveUrl(src);
                    videoSources.push({
                        url: videoUrl,
                        type: videoUrl.includes("m3u8") ? "m3u8" : "mp4",
                        quality: $el.attr("label") || "default",
                        label: $el.attr("title") || $el.attr("label") || "Default"
                    });
                }
            });
            
            // === STRATÉGIE 2: Extraire les sous-titres ===
            $("track").each((_, element) => {
                const $el = $(element);
                const src = $el.attr("src");
                const lang = $el.attr("label") || $el.attr("srclang") || "fr";
                
                if (src) {
                    subtitles.push({
                        id: lang,
                        url: this.resolveUrl(src),
                        language: lang,
                        isDefault: $el.attr("default") !== undefined
                    });
                }
            });
            
            // Rechercher des sous-titres dans les scripts
            const subRegex = /["'](https?:\/\/[^"']+\.(vtt|srt|ass)[^"']*)["']/gi;
            let subMatch;
            while ((subMatch = subRegex.exec(html)) !== null) {
                subtitles.push({
                    id: `sub-${subtitles.length}`,
                    url: this.resolveUrl(subMatch[1]),
                    language: "fr",
                    isDefault: subtitles.length === 0
                });
            }
            
            // === SI AUCUNE SOURCE N'EST TROUVÉE ===
            if (videoSources.length === 0) {
                // Essayer de trouver l'URL dans les paramètres JS
                const jsRegex = /(?:url|src|file)\s*[=:]\s*["']([^"']+)["']/gi;
                let jsMatch;
                const potentialUrls = [];
                
                while ((jsMatch = jsRegex.exec(html)) !== null) {
                    potentialUrls.push(jsMatch[1]);
                }
                
                for (const url of potentialUrls) {
                    if (url.includes("video") || url.includes("stream") || url.includes("m3u8") || url.includes("mp4")) {
                        videoSources.push({
                            url: this.resolveUrl(url),
                            type: "unknown",
                            quality: "auto",
                            label: "Auto-detected"
                        });
                        break;
                    }
                }
            }
            
            // === PRÉPARER LA RÉPONSE FINALE ===
            if (videoSources.length === 0) {
                throw new Error("No video source found");
            }
            
            return {
                server: server || "default",
                headers: {
                    "Referer": this.baseUrl,
                    "User-Agent": this.headers["User-Agent"],
                    "Origin": this.baseUrl
                },
                videoSources: videoSources.map(source => ({
                    ...source,
                    subtitles: subtitles
                }))
            };
            
        } catch (error) {
            console.error("[TenshiTV] Find episode server error:", error);
            
            // Fallback: retourner un message d'erreur utile
            throw new Error(`Failed to get video: ${error.message}. Try enabling ChromeDP in settings if the site uses JavaScript.`);
        }
    }
}
