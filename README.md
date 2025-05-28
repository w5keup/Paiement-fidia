# Paiement-fidia

## Project Overview
A secure payment system for Fidia Pharma using Stripe.

## Setup Instructions

1. Clone the repository.
2. Install dependencies for both frontend and backend:
   ```cmd
   cd public\frontend
   npm install
   cd ..\server
   npm install
   ```
3. Create a `.env` file in `public/server` with your Stripe keys:
   ```env
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   ```
4. Start the server:
   ```cmd
   cd public\server
   npm start
   ```

## Deployment Notes
- Ensure HTTPS is enabled in production.
- Set `NODE_ENV=production` for best performance and security.
- Restrict CORS to your frontend domain in production.
- Do not commit `.env` or sensitive files.

## Security
- Uses `helmet` and `cors` for security best practices.
- File uploads are limited to 3MB and stored in a non-public directory.

## Author
Add your name and contact info here.

## License
ISC (change if needed)