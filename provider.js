/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {

    // ==========================================
    // CONFIGURATION
    // ==========================================
    private readonly baseUrl = "https://tenshitv.com";
    
    // Headers pour simuler un vrai navigateur et éviter le blocage Cloudflare/Anti-Bot
    private readonly headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": this.baseUrl,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
    };

    // ==========================================
    // SETTINGS
    // ==========================================
    getSettings(): Settings {
        return {
            // Si TenshiTV propose plusieurs serveurs (Lulu, VidCloud, etc.), ajoute leurs noms ici.
            // Sinon, reste sur "default"
            episodeServers: ["default"], 
            supportsDub: true // Met false si le site n'a pas de VF
        };
    }

    // ==========================================
    // METHODES UTILITAIRES (HELPERS)
    // ==========================================

    /**
     * Convertit une URL relative en URL absolue si besoin
     */
    private resolveUrl(url: string | undefined): string {
        if (!url) return "";
        if (url.startsWith("http")) return url;
        if (url.startsWith("//")) return "https:" + url;
        return this.baseUrl + (url.startsWith("/") ? "" : "/") + url;
    }

    /**
     * Nettoie une chaîne et extrait le premier nombre entier (pour les épisodes)
     * Ex: "Episode 5 VF" -> 5
     */
    private extractEpisodeNumber(text: string): number {
        if (!text) return -1;
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : -1;
    }

    // ==========================================
    // 1. RECHERCHE (SEARCH)
    // ==========================================
    async search(opts: SearchOptions): Promise<SearchResult[]> {
        console.log(`[TenshiTV Ultimate] Recherche : "${opts.query}"`);

        try {
            // Construction de l'URL de recherche
            const searchQuery = encodeURIComponent(opts.query);
            const searchUrl = `${this.baseUrl}/search?q=${searchQuery}`; 
            // NOTE: Si ça échoue, essaye "/search?keyword=" ou "/?s="

            const res = await fetch(searchUrl, { headers: this.headers });

            if (!res.ok) {
                console.warn(`[TenshiTV] Erreur HTTP ${res.status} lors de la recherche.`);
                return [];
            }

            const html = await res.text();
            const $ = LoadDoc(html);
            const results: SearchResult[] = [];

            // SÉLECTEUR INTELLIGENT :
            // On cherche les conteneurs qui ressemblent à des cartes d'anime.
            // On cible généralement les balises <a> contenant une image ou un titre, dans une div.
            const selectors = [
                "div.card a",           // Bootstrap style
                "div.item a",           // Generic list
                "article a",            // Semantic HTML
                "li a",                 // List items
                "a[href*='/anime/']"    // Direct links to anime pages
            ];

            selectors.forEach(selector => {
                if (results.length >= 10) return; // Limite atteinte

                $(selector).each((_, el) => {
                    if (results.length >= 10) return false;

                    const $el = $(el);
                    const href = $el.attr("href");
                    const title = $el.attr("title") || $el.text().trim();
                    
                    // Filtre basique : on ignore les liens vides ou les liens "contact", "login", etc.
                    if (href && title && title.length > 2 && !href.includes("login") && !href.includes("register")) {
                        const fullUrl = this.resolveUrl(href);
                        
                        // Vérification doublon
                        if (!results.find(r => r.id === fullUrl)) {
                            results.push({
                                id: fullUrl,
                                title: title,
                                url: fullUrl,
                                subOrDub: "both"
                            });
                        }
                    }
                });
            });

            console.log(`[TenshiTV] ${results.length} animes trouvés.`);
            return results;

        } catch (error) {
            console.error("[TenshiTV] Erreur critique dans search():", error);
            return [];
        }
    }

    // ==========================================
    // 2. LISTE DES ÉPISODES (FIND EPISODES)
    // ==========================================
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        console.log(`[TenshiTV] Récupération épisodes pour ID : ${id}`);

        try {
            const res = await fetch(id, { headers: this.headers });
            const html = await res.text();
            const $ = LoadDoc(html);
            const episodes: EpisodeDetails[] = [];

            // SÉLECTEURS POUR LES ÉPISODES
            // On cherche généralement une liste de liens
            const episodeSelectors = [
                "div.episodes a",      // Classe standard
                "div.ep-list a",       // Variante
                "li.episode a",        // Liste <li>
                "a[href*='ep']"        // Tout lien contenant 'ep' dans l'URL
            ];

            episodeSelectors.forEach(selector => {
                // Si on a déjà trouvé des épisodes avec un sélecteur précédent, on s'arrête
                if (episodes.length > 0) return;

                $(selector).each((i, el) => {
                    const $el = $(el);
                    const href = $el.attr("href");
                    const text = $el.text().trim();

                    if (href) {
                        const fullUrl = this.resolveUrl(href);
                        
                        // Extraction intelligente du numéro
                        // Si le texte est "Ep 5", on prend 5. Si c'est juste le lien, on utilise l'index.
                        let num = this.extractEpisodeNumber(text);
                        if (num === -1) num = i + 1;

                        // On évite les doublons d'URL
                        if (!episodes.find(e => e.url === fullUrl)) {
                            episodes.push({
                                id: fullUrl,
                                number: num,
                                url: fullUrl,
                                title: text || `Episode ${num}`
                            });
                        }
                    }
                });
            });

            // Tri par numéro d'épisode (très important pour Seanime)
            episodes.sort((a, b) => a.number - b.number);

            console.log(`[TenshiTV] ${episodes.length} épisodes chargés et triés.`);
            return episodes;

        } catch (error) {
            console.error("[TenshiTV] Erreur dans findEpisodes():", error);
            return [];
        }
    }

    // ==========================================
    // 3. RÉCUPÉRATION DE LA VIDÉO (FIND SERVER)
    // ==========================================
    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        console.log(`[TenshiTV] Récupération stream pour : ${episode.number}`);

        try {
            const res = await fetch(episode.url, { headers: this.headers });
            const html = await res.text();
            const $ = LoadDoc(html);

            let videoUrl = "";
            let videoType: "mp4" | "m3u8" | "unknown" = "unknown";

            // === STRATÉGIE 1 : Extraction M3U8 directe (RegEx) ===
            // Beaucoup de sites cachent le lien .m3u8 directement dans le JS ou le HTML source
            const m3u8Regex = /"(https?:\/\/.*?\.m3u8.*?)"|'(https?:\/\/.*?\.m3u8.*?)'/g;
            let match;
            while ((match = m3u8Regex.exec(html)) !== null) {
                // match[1] est entre guillemets doubles, match[2] entre simples
                const potentialUrl = match[1] || match[2];
                if (potentialUrl) {
                    videoUrl = potentialUrl;
                    videoType = "m3u8";
                    break; // On prend le premier trouvé
                }
            }

            if (videoUrl) {
                console.log("[TenshiTV] Lien M3U8 extrait via Regex.");
            } 
            // === STRATÉGIE 2 : Iframe (Embed) ===
            else {
                // On cherche un iframe. Souvent c'est un lecteur tiers (VidCloud, Lulu, etc.)
                const iframe = $("iframe").first();
                if (iframe.length) {
                    videoUrl = iframe.attr("src") || "";
                    console.log("[TenshiTV] Iframe détecté :", videoUrl);
                    videoType = "unknown"; // Seanime essayera de le lire
                } 
                // === STRATÉGIE 3 : Balise Vidéo HTML5 ===
                else {
                    const videoTag = $("video").first();
                    if (videoTag.length) {
                        videoUrl = videoTag.attr("src") || "";
                        // Parfois les sources sont dans des balises <source> enfants
                        if (!videoUrl) {
                            const source = videoTag.find("source").first();
                            videoUrl = source.attr("src") || "";
                        }
                        videoType = "mp4";
                        console.log("[TenshiTV] Vidéo MP4 directe détectée.");
                    }
                }
            }

            if (!videoUrl) {
                throw new Error("Aucun flux vidéo trouvé (M3U8, Iframe ou MP4).");
            }

            // Assurer que l'URL est absolue
            videoUrl = this.resolveUrl(videoUrl);

            // === QUALITÉ (Extraction basique) ===
            // On essaie de deviner la qualité via l'URL (ex: 1080p, 720)
            let quality = "1080p"; // Défaut
            if (videoUrl.includes("720")) quality = "720p";
            else if (videoUrl.includes("480")) quality = "480p";
            else if (videoUrl.includes("360")) quality = "360p";

            // === RÉPONSE FINALE ===
            return {
                server: _server || "default",
                headers: {
                    "Referer": episode.url, // Important : le referer doit être la page de l'épisode
                    "User-Agent": this.headers["User-Agent"]
                },
                videoSources: [{
                    url: videoUrl,
                    type: videoType,
                    quality: quality,
                    label: "Default",
                    subtitles: [] // Pourrait être implémenté en cherchant <track>
                }]
            };

        } catch (error) {
            console.error("[TenshiTV] Erreur critique dans findEpisodeServer():", error);
            throw error;
        }
    }
}
