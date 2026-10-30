# Relier la page Vercel à OmniRoute (VPS) par Tailscale

La page Vercel ne contacte jamais ton VPS : ce sont **le navigateur de ta tablette** (sur Tailscale) qui appelle OmniRoute. Rien n'est exposé sur Internet.

Il faut trois choses : Tailscale actif sur la tablette, une adresse **HTTPS** (la page est en HTTPS, le navigateur refuse d'appeler du HTTP depuis elle), et qu'OmniRoute autorise les appels venant de la page (CORS).

## 1. Adresse HTTPS Tailscale (sur le VPS)

Repère le port local d'OmniRoute (par exemple 3000), puis :

```bash
tailscale serve --bg --https=443 http://127.0.0.1:PORT
tailscale serve status        # affiche l'adresse https://NOM.TAILNET.ts.net
```

L'adresse de l'API à saisir dans la page est alors `https://NOM.TAILNET.ts.net/v1` (si OmniRoute expose son API sous `/v1`).

## 2. Tester depuis la tablette

Dans la page : **Connexion à OmniRoute**, saisis l'adresse et la clé, puis « Tester et enregistrer ».
- Si la liste des modèles apparaît, c'est terminé.
- Si le message parle de Tailscale, d'HTTPS ou de CORS : vérifie d'abord que Tailscale est actif sur la tablette et que l'adresse s'ouvre dans son navigateur. Si l'adresse s'ouvre mais que la page échoue, c'est le CORS (étape 3).

## 3. Si le CORS bloque : ajouter les en-têtes avec Caddy

`tailscale serve` ne permet pas d'ajouter des en-têtes. Place Caddy devant OmniRoute (remplace le domaine, le port et l'origine) :

```caddyfile
NOM.TAILNET.ts.net {
	@preflight method OPTIONS
	handle @preflight {
		header Access-Control-Allow-Origin "https://atelier-z.vercel.app"
		header Access-Control-Allow-Headers "authorization, content-type"
		header Access-Control-Allow-Methods "GET, POST, OPTIONS"
		header Access-Control-Allow-Private-Network "true"
		header Access-Control-Max-Age "600"
		respond 204
	}
	header Access-Control-Allow-Origin "https://atelier-z.vercel.app"
	header Vary "Origin"
	reverse_proxy 127.0.0.1:PORT
}
```

Pour que Caddy obtienne le certificat Tailscale du domaine `.ts.net`, autorise-le dans `/etc/default/tailscaled` : `TS_PERMIT_CERT_UID=caddy`, puis redémarre `tailscaled`. Si tu utilises ce Caddy, arrête d'abord `tailscale serve` sur le port 443 (`tailscale serve reset`).

## Sécurité

- Garde une clé d'accès OmniRoute dédiée à cette page, avec les modèles autorisés limités, et fais-la pivoter si elle a circulé.
- Limite l'origine autorisée à ton domaine Vercel (ci-dessus), jamais `*`.
- Cette configuration n'a pas été testée sur ton VPS : elle est écrite d'après la documentation de Tailscale et de Caddy.
