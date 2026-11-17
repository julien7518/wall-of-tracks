# Wall of Tracks

Une affiche interactive générée à partir des écoutes Last.fm récentes : un disque de pochettes, une carte du temps et une partition. Une seule page, pas de scroll, avec la direction artistique de mon portfolio.

## Lancer

```bash
cp .env.example .env
# mettre ta clé Last.fm dans LASTFM_API_KEY
docker compose up --build
```

Ouvre **http://localhost:3001**.

Sans Compose :

```bash
npm install
cp .env.example .env
npm run dev
```

Ouvre **http://localhost:3000**.

Avec `docker run` direct :

```bash
docker build -t wall .
docker run --rm --env-file .env -p 3001:3000 wall
```

Variables : `LASTFM_API_KEY` est requise, `LASTFM_USERNAME` est optionnelle, `PORT` default `3001` avec Compose.

## Ce que fait l’appli

- Le navigateur appelle seulement `/api/tracks` et `/api/artwork`.
- La clé Last.fm reste sur le serveur, dans `.env` jamais commité.
- Cache de 60 s : deux rechargements = un appel Last.fm. Si Last.fm tombe, le dernier relevé reste affiché.
- Vues : `DISQUE`, `TEMPS`, `ALBUMS`. Clic sur un album pour l’épingler, `Échap` pour effacer.
- Le centre du disque lance/arrête la rotation, le double-clic change les sillons.

## Vérifier

```bash
npm run typecheck && npm run lint && npm run build
```

Démo 3 min : montrer le disque, cliquer son centre, épingler un album, puis passer de `24 h` à `7 j`.
