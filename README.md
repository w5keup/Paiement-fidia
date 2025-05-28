# Paiement Fidia Pharma

## Présentation du projet
Bienvenue ! Cette application web permet de payer en ligne de façon sécurisée pour les produits Fidia Pharma. Elle est simple à utiliser et fonctionne sur ordinateur, tablette ou téléphone.

---

## Prérequis
- Un ordinateur Windows
- [Node.js](https://nodejs.org/) installé (version recommandée : 18 ou plus)
- [ngrok](https://ngrok.com/download) pour rendre le site accessible à l’extérieur

---

## Installation étape par étape

### 1. Télécharger le projet
- Téléchargez ou clonez ce dossier sur votre ordinateur.

### 2. Installer les dépendances
Ouvrez l’application “Invite de commandes” (cmd.exe) et tapez :

```cmd
cd chemin\vers\le\dossier\fidia_project\public\frontend
npm install
cd ..\server
npm install
```

### 3. Préparer les variables secrètes
Dans le dossier `public/server`, créez un fichier nommé `.env` et ajoutez :

```
STRIPE_SECRET_KEY=VotreCléSecrèteStripe
STRIPE_PUBLISHABLE_KEY=VotreCléPubliqueStripe
```

Remplacez par vos vraies clés Stripe (test ou production).

---

## Lancer l’application en local
Dans l’invite de commandes :

```cmd
cd chemin\vers\le\dossier\fidia_project\public\server
npm start
```

Le site fonctionne maintenant sur votre ordinateur à l’adresse :
```
http://localhost:3000
```

---

## Rendre le site accessible à l’extérieur avec ngrok
1. Téléchargez [ngrok](https://ngrok.com/download) et décompressez-le.
2. Dans une nouvelle fenêtre de commande, tapez :

```cmd
chemin\vers\ngrok.exe http 3000
```

3. ngrok affichera un lien du type :
```
https://xxxx-xx-xx-xx-xx.ngrok-free.app
```

4. Copiez ce lien et envoyez-le à vos testeurs. Ils pourront accéder au site depuis n’importe où !

**Attention :**
- Laissez votre ordinateur et le serveur ouverts tant que le site doit être accessible.
- Si vous fermez ngrok ou le serveur, le lien ne fonctionnera plus.

---

## Astuces et dépannage
- Si le site ne s’affiche pas correctement, vérifiez que le serveur est bien démarré et que ngrok tourne.
- Si un port est déjà utilisé, redémarrez votre ordinateur ou changez de port (ex : 3001).
- Pour toute erreur, relancez les commandes ci-dessus étape par étape.

---

## Contact
Pour toute question, contactez l’équipe Fidia Pharma ou la personne qui vous a transmis ce projet.

---

Bonne utilisation ! 🎉