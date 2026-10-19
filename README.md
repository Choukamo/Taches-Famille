# Tâches Famille

Application web installable (PWA) pour se répartir les tâches de la maison : Flora, John, Matis et Nina.

- Chacun peut créer une tâche et la donner à une ou plusieurs personnes, ou lancer une **roulette** qui tire au sort.
- La personne reçoit une **notification**, puis un rappel régulier (réglable, 1 h par défaut) jusqu'à ce qu'elle appuie sur « C'est fait ».
- Les notifications respectent les **horaires** de chacun (10h–22h par défaut) et les semaines de présence (une semaine sur deux).
- Un **classement** compte les tâches terminées.

## Technique

- `web/` : interface (Vite + React + TypeScript), hébergée sur GitHub Pages.
- `supabase/migrations/` : base de données (Postgres), règles d'accès et fonctions (`create_task`, `complete_task`, …).
- `supabase/functions/send-reminders/` : fonction serveur qui envoie les notifications push (Web Push / VAPID), appelée toutes les 5 minutes par `pg_cron` et juste après la création d'une tâche.

Les valeurs dans `web/.env.production` (URL Supabase, clé `anon`, clé publique VAPID) sont publiques par nature. Les secrets (clé privée VAPID, `CRON_SECRET`) sont stockés uniquement dans Supabase.

### Développer en local

```bash
cd web
npm install
npm run dev
```
