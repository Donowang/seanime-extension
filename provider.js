/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {

    // L'URL de base du site
    private baseUrl = "https://tenshitv.com";

    getSettings(): Settings {
        return {
            // Liste les serveurs disponibles (ex: "VidCloud", "StreamTape" si TenshiTV en utilise)
            episodeServers: ["default"], 
            supportsDub: false // Mets true si TenshiTV a des versions VF
        };
    }

    // 1. RECHERCHE
    async search(opts: SearchOptions): Promise<SearchResult[]> {
        // TODO: Ici tu dois trouver comment TenshiTV fait sa recherche.
        // Est-ce une API ? (ex: fetch("https://tenshitv.com/api/search?q=..."))
        // Ou est-ce du HTML ? (ex: LoadDoc(html))
        
        console.log("Recherche pour :", opts.query);

        try {
            // EXEMPLE HYPOTHÉTIQUE (À MODIFIER) :
            // const res = await fetch(`${this.baseUrl}/api/search?q=${opts.query}`);
            // const data = await res.json();

            const results: SearchResult[] = [];

            // // Si c'est du JSON, tu boucles sur data :
            // for (const item of data) {
            //     results.push({
            //         id: item.id, // L'ID unique de l'anime sur TenshiTV
            //         title: item.title,
            //         url: `${this.baseUrl}/anime/${item.slug}`,
            //         subOrDub: "sub"
            //     });
            // }

            return results;
        } catch (e) {
            console.error("Erreur recherche:", e);
            return [];
        }
    }

    // 2. TROUVER LES ÉPISODES
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        console.log("Chargement des épisodes pour l'ID :", id);
        
        // TODO: Ici tu utilises l'ID récupéré dans 'search' pour aller sur la page de l'anime
        // et récupérer la liste des épisodes.
        
        const episodes: EpisodeDetails[] = [];

        // EXEMPLE HYPOTHÉTIQUE :
        // const res = await fetch(`${this.baseUrl}/anime/${id}`);
        // const html = await res.text();
        // const $ = LoadDoc(html);
        
        // $("a.episode-link").each((i, el) => {
        //     episodes.push({
        //         id: $(el).attr("href"), // L'ID de l'épisode
        //         number: parseInt($(el).text()), // Le numéro d'épisode
        //         url: $(el).attr("href"),
        //         title: $(el).text()
        //     });
        // });

        return episodes;
    }

    // 3. TROUVER LA VIDÉO (LE LIEN STREAM)
    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        console.log("Récupération vidéo pour :", episode.url);

        // TODO: C'est l'étape la plus dure. Tu dois aller sur la page de l'épisode,
        // trouver le lien de l'iframe ou du fichier .m3u8.
        
        // Souvent, il faut utiliser ChromeDP si le site utilise du JavaScript complexe pour charger le lecteur.
        // Si c'est du simple HTML, fetch suffit.

        return {
            server: "default",
            headers: {}, // Ajoute des headers si besoin (ex: Referer)
            videoSources: [{
                url: "LIEN_M3U8_OU_MP4_ICI",
                type: "m3u8", // ou "mp4"
                quality: "1080p",
                subtitles: [] // Si tu trouves des sous-titres
            }]
        };
    }
}