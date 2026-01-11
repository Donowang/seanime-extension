# TenshiTV Seanime Extension

Extension pour ajouter TenshiTV comme source de streaming dans Seanime.

## Installation

1. Téléchargez les fichiers `manifest.json` et `provider.js`
2. Créez un dépôt GitHub (ou utilisez GitLab, etc.)
3. Uploadez les fichiers
4. Dans Seanime : Extensions → Install from URL
5. Collez le lien RAW du `manifest.json`

## Configuration

- **Base URL** : L'URL de base de TenshiTV (par défaut: https://tenshitv.com)
- **Use ChromeDP** : Activez cette option si le site utilise beaucoup de JavaScript

## Dépannage

### La recherche ne fonctionne pas
- Vérifiez que l'URL de base est correcte
- Activez ChromeDP si le site est en JavaScript

### Pas d'épisodes trouvés
- L'extension essaie plusieurs sélecteurs, mais vous devrez peut-être ajuster le code

### Pas de vidéo trouvée
- Activez l'option ChromeDP
- Vérifiez que le site n'est pas bloqué par Cloudflare

## Mise à jour

Pour mettre à jour :
1. Modifiez le code
2. Augmentez le numéro de version dans `manifest.json`
3. Re-uploadez les fichiers
4. Seanime détectera automatiquement la mise à jour
