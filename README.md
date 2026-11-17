# Wall of Tracks — édition d’écoutes

Une **affiche éditoriale** générée à partir des écoutes Last.fm récentes. Pas de constellation, pas de tableau de bord : une page papier claire, une immense typographie italique, un disque construit à partir des pochettes, une carte circulaire du temps et une partition fine des écoutes. **La composition tient dans une seule hauteur d’écran : aucun scroll**, sur ordinateur comme sur téléphone. La direction artistique reprend les codes de [julien-fernandes.vercel.app](https://julien-fernandes.vercel.app) : fond papier chaud `#fbfaf9`, encre `#0c0a09`, orange brûlé `#b75000`, Geist / Geist Mono / Instrument Serif, filets 1 px et micro-labels espacés.

## Ce que l’on voit

- Le **nom de l’artiste dominant** occupe la moitié gauche comme un titre d’affiche, accompagné d’un empilement des **3 pochettes les plus récentes**.
- Le **disque** est la pièce centrale : chaque album devient un sillon dont la largeur suit son temps d’écoute, et les sillons sont classés autour du cercle chromatique. Le centre affiche la pochette en cours, avec un reflet fixe et des rainures qui restent en place pendant la rotation — un clin d’œil à [Wall of Tracks](https://walloftrack.thomasjuldo.com/).
- La **carte du temps** à droite place chaque écoute sur un cadran : l’angle donne le moment dans la période choisie, la distance au centre donne la minute (24 h) ou l’heure de la journée (7 j). La couleur vient de la pochette de l’album.
- Le **bandeau d’albums**, en bas, montre les 12 pochettes les plus écoutées ; la **partition** qui suit convertit la période en traits fins, dont la hauteur donne le nombre d’écoutes par intervalle.
- Le curseur carré du portfolio est repris à l’identique : 20 px, 30 px et rotation à 90° au survol d’un élément interactif, le tout en `mix-blend-mode: difference`.

### Interactions

- Le sélecteur **DISQUE / TEMPS / ALBUMS** bascule entre le vinyle, la carte du temps et une mosaïque de pochettes animée.
- Le **disque** tourne quand un morceau est en cours ; un clic sur son centre lance ou arrête le mouvement, et un double-clic bascule entre sillons francs et sillons organiques.
- Survoler un sillon met son album en avant ; cliquer l’épingle et remplace le grand titre. Cliquer le centre du disque commande la rotation.
- Glisser sur le cadran déplace une tête de lecture orange et révèle l’écoute la plus proche.
- `Échap` efface la sélection.

## Stack technique

| Couche | Choix |
| --- | --- |
| Front | React 19 + TypeScript via Next.js 16 (App Router) |
| Style | CSS natif, SVG, `next/font` pour Geist et Instrument Serif |
| API | Route handlers Next.js (`/api/tracks`, `/api/artwork`, `/api/health`) |
| Cache | Mémoire du processus, TTL 60 s, *single-flight*, reprise sur erreur |
| Exécution | Node 22, Dockerfile multi-stage + `docker compose` |

## Démarrage

```bash
cp .env.example .env
# édite .env : remplace le placeholder par ta propre clé Last.fm
docker compose up --build
```

Ouvre **http://localhost:3001**. Le port hôte par défaut est 3001 pour éviter un conflit avec un autre service déjà sur 3000. Pour un autre port : `PORT=4000 docker compose up`.

Si tu lances l’image directement sans Compose, il faut passer le `.env` au conteneur au moment du `docker run` :

```bash
docker build -t wall .
docker run --rm --env-file .env -p 3001:3000 wall
```

Le `.env` est volontairement exclu de l’image par `.dockerignore` : Next.js le lit en local, mais Docker ne le charge pas tout seul. Composer l’injecte via `docker-compose.yml` ; avec `docker run`, c’est `--env-file .env` qui s’en charge.

| Variable | Requise | Défaut | Rôle |
| --- | --- | --- | --- |
| `LASTFM_API_KEY` | oui | — | Clé API lue **uniquement par le serveur** |
| `LASTFM_USERNAME` | non | `jojjjjoooooooo` | Profil Last.fm interrogé |
| `PORT` | non | `3001` | Port hôte exposé par Compose (le conteneur écoute toujours sur 3000) |

Sans clé, l’application démarre quand même et affiche un message lisible plutôt qu’une page vide.

Développement local : `npm install`, `cp .env.example .env`, `npm run dev`.

## Comment ça marche

```
Navigateur  ──► /api/tracks?range=24h ──► [cache 60 s] ──► Last.fm  user.getRecentTracks
     │                                       │
     │                                       └─► si Last.fm échoue : dernier relevé + bandeau
     └──► /api/artwork?url=… ──► [cache 24 h] ──► CDN Last.fm (serveur seulement)
```

1. Le navigateur n’appelle **jamais** Last.fm. `/api/tracks` interroge `user.getrecenttracks` côté serveur avec la clé lue dans la variable d’environnement.
2. Le cache mémoire garde la réponse 60 secondes : deux rechargements = un appel Last.fm. Les visiteurs simultanés partagent le même appel.
3. Si Last.fm tombe après un premier chargement, le serveur renvoie l’ancien relevé (`stale: true`) et un bandeau discret apparaît sous la navigation. Sans relevé précédent, un titre et un bouton « réessayer » apparaissent au centre.
4. `/api/artwork` proxie les pochettes avec une liste blanche de domaines. Le navigateur reçoit des images same-origin : un `<canvas>` peut en lire les couleurs sans erreur CORS. Leurs dominantes colorent les points (48 albums maximum, avec repli déterministe).
5. La carte et la partition se recalculent côté client dès que la période change ; le rendu reste déterministe pour un même relevé.

### Points d’API

- `GET /api/tracks?range=24h|7d` — écoutes + statistiques. `refresh=1` force l’appel amont.
- `GET /api/artwork?url=<url encodée>` — proxy d’image, domaines autorisés seulement.
- `GET /api/health` — état du serveur, sans révéler la clé.

## Vérification des contraintes

- **Aucune requête navigateur vers Last.fm** : l’onglet Network ne montre que `/api/tracks`, `/api/artwork` et les fichiers statiques.
- **Deux rechargements = un appel Last.fm** : prouvé par l’en-tête `X-Cache-State` (`fresh` puis `hit`).
- **Clé absente du dépôt** : `.env` est ignoré ; seul `.env.example` contient un placeholder. Vérifié dans tout l’historique Git.
- **Last.fm injoignable** : message lisible, jamais de page blanche.
- **Téléphone / ordinateur** : la grille passe en une colonne sous 900 px ; la page reste non scrollable dans les deux cas.

## Scripts

```bash
npm run typecheck
npm run lint
npm run build
```

## Structure

```
app/
  api/tracks/route.ts     proxy Last.fm, cache, repli sur erreur
  api/artwork/route.ts    proxy d’images avec liste blanche
  api/health/route.ts     healthcheck
  page.tsx                navigation, état, messages
  layout.tsx              polices Geist / Geist Mono / Instrument Serif
  globals.css             direction artistique papier
components/
  Cursor.tsx              curseur carré du portfolio
  Poster.tsx              affiche, vues, partition
  Disc.tsx                disque vinyle, sillons, rotation
lib/
  cache.ts                TTL + single-flight + cache d’octets borné
  lastfm.ts               appel user.getRecentTracks, normalisation
  palette.ts              couleur dominante des pochettes
  usePalettes.ts          palette par album (48 albums maximum)
  hash.ts, types.ts
```

## Idée à défendre en démo (3 min)

1. Montrer le disque qui tourne, cliquer son centre pour l’arrêter, basculer en sillons organiques, épingler un album, glisser sur le cadran, passer en mosaïque puis de 24 h à 7 j.
2. « Je voulais une affiche, pas un dashboard : la même DA que mon portfolio, mais alimentée par ma musique. »
3. Expliquer le trajet navigateur → serveur → Last.fm, la clé dans l’environnement, le cache 60 s et les pochettes proxied pour rester same-origin.
