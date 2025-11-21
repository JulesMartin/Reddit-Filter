# Guide de Démarrage Rapide

## Étape 1 : Obtenir les Credentials Reddit API

1. Allez sur https://www.reddit.com/prefs/apps
2. Cliquez sur "Create App" ou "Create Another App"
3. Remplissez :
   - **name:** Reddit Analyzer
   - **App type:** Sélectionnez "script"
   - **description:** (optionnel)
   - **about url:** (optionnel)
   - **redirect uri:** http://localhost
4. Cliquez sur "Create app"
5. Notez les informations :
   - **client_id** : sous le nom de l'app (chaîne courte)
   - **client_secret** : indiqué comme "secret"

## Étape 2 : Configuration de l'Environnement

Éditez `backend/.env` et ajoutez vos credentials :

```env
REDDIT_CLIENT_ID=votre_client_id_ici
REDDIT_CLIENT_SECRET=votre_client_secret_ici
```

## Étape 3 : Installation des Dépendances

```bash
cd backend
npm install
```

## Étape 4 : Démarrer les Services

### Démarrer PostgreSQL et Redis avec Docker

```bash
# Dans le dossier racine du projet
docker-compose up -d
```

Vérifiez que les services fonctionnent :
```bash
docker-compose ps
```

Vous devriez voir :
- `reddit_postgres` - running
- `reddit_redis` - running

### Démarrer le Backend

```bash
cd backend
npm run dev
```

Si tout fonctionne, vous verrez :
```
✅ Redis connected
✅ PostgreSQL connected
🚀 Reddit Analyzer API running on http://localhost:3000
```

## Étape 5 : Tester l'API

### Test 1 : Health Check

```bash
curl http://localhost:3000/api/health
```

Réponse attendue :
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected",
    "reddit": {
      "rateLimit": { ... }
    }
  }
}
```

### Test 2 : Synchroniser un Subreddit

Testons avec r/startups :

```bash
curl -X POST http://localhost:3000/api/etl/sync-subreddit \
  -H "Content-Type: application/json" \
  -d "{
    \"subreddit\": \"startups\",
    \"limit\": 25,
    \"sort\": \"hot\",
    \"timeFilter\": \"week\"
  }"
```

Réponse attendue :
```json
{
  "success": true,
  "message": "Synced 25 posts from r/startups",
  "data": {
    "postsCount": 25,
    "errors": []
  }
}
```

### Test 3 : Recherche Avancée

```bash
curl -X POST http://localhost:3000/api/posts/search \
  -H "Content-Type: application/json" \
  -d "{
    \"keywords\": [\"SaaS\", \"startup\"],
    \"minUpvotes\": 10,
    \"limit\": 10
  }"
```

### Test 4 : Statistiques

```bash
curl http://localhost:3000/api/posts/stats
```

## Étape 6 : Exploration de la Base de Données

Connectez-vous à PostgreSQL :

```bash
docker exec -it reddit_postgres psql -U reddit_user -d reddit_analyzer
```

Requêtes utiles :
```sql
-- Voir les subreddits synchronisés
SELECT * FROM subreddits;

-- Compter les posts
SELECT COUNT(*) FROM posts;

-- Top posts par score
SELECT title, score, comment_count FROM posts ORDER BY score DESC LIMIT 10;

-- Posts par subreddit
SELECT s.name, COUNT(p.id) as post_count
FROM subreddits s
LEFT JOIN posts p ON s.id = p.subreddit_id
GROUP BY s.name;
```

Quitter psql : `\q`

## Exemples d'Utilisation Avancée

### Synchroniser Plusieurs Subreddits

```bash
curl -X POST http://localhost:3000/api/etl/batch-sync \
  -H "Content-Type: application/json" \
  -d "{
    \"subreddits\": [\"startups\", \"SaaS\", \"entrepreneur\"],
    \"limit\": 50
  }"
```

### Recherche avec Filtres Avancés

```bash
curl -X POST http://localhost:3000/api/posts/search \
  -H "Content-Type: application/json" \
  -d "{
    \"keywords\": [\"funding\", \"investors\"],
    \"requiredKeywords\": [\"seed\"],
    \"subreddits\": [\"startups\"],
    \"minUpvotes\": 50,
    \"minKarma\": 5000,
    \"limit\": 20
  }"
```

### Recherche par Période

```bash
curl -X POST http://localhost:3000/api/posts/search \
  -H "Content-Type: application/json" \
  -d "{
    \"keywords\": [\"product launch\"],
    \"dateRange\": {
      \"start\": \"2024-01-01\",
      \"end\": \"2024-12-31\"
    },
    \"limit\": 50
  }"
```

## Troubleshooting

### Erreur : "Reddit API credentials not configured"

Solution : Vérifiez que `backend/.env` contient bien vos credentials Reddit.

### Erreur : "ECONNREFUSED" (PostgreSQL)

Solution : Démarrez Docker Compose : `docker-compose up -d`

### Erreur : "Rate limit reached"

Solution : Attendez 60 secondes ou augmentez `REDDIT_RATE_LIMIT_PER_MINUTE` dans `.env`

### Ports déjà utilisés

Si les ports 3000, 5432 ou 6379 sont déjà utilisés :
- Backend : Changez `PORT` dans `.env`
- PostgreSQL : Modifiez le port dans `docker-compose.yml`
- Redis : Modifiez le port dans `docker-compose.yml`

## Commandes Utiles

```bash
# Voir les logs Docker
docker-compose logs -f

# Arrêter les services
docker-compose down

# Redémarrer PostgreSQL
docker-compose restart postgres

# Vider le cache Redis
docker exec -it reddit_redis redis-cli FLUSHALL

# Rebuild des containers
docker-compose up -d --build

# Voir l'état de Node
npm run dev
```

## Prochaines Étapes

Une fois que tout fonctionne :

1. Synchronisez vos subreddits favoris
2. Explorez les données avec des recherches
3. Analysez les statistiques
4. Prêt pour Phase 2 : Frontend React !
