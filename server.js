const express = require('express');
const stripe = require('stripe')('sk_test_51QjjbVEjwPvkgqugsw7cALWdVj99aCrPNrGnorl4XFHtFjS92cTbCOCZhA3FlSVCmab5xcikvVaEEgOvePtyGDwm00FbKzqLg5');
const bolt = require('@bolt/api')('YOUR_BOLT_API_KEY'); // Remplacez par votre clé API Bolt
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.static('.'));
app.use(express.json());

// Ensure access_codes.json exists
function initializeAccessCodes() {
    const filePath = 'access_codes.json';
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify({ used_codes: [] }, null, 2));
        }
    } catch (error) {
        console.error('Error initializing access_codes.json:', error);
    }
}

// Initialize on server start
initializeAccessCodes();

// Fonction pour lire les codes
function readAccessCodes() {
    try {
        const data = fs.readFileSync('access_codes.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading access_codes.json:', error);
        return { used_codes: [] };
    }
}

// Fonction pour sauvegarder les codes
function saveAccessCodes(codes) {
    try {
        fs.writeFileSync('access_codes.json', JSON.stringify(codes, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving to access_codes.json:', error);
        return false;
    }
}

// Fonction pour générer un code unique
function generateUniqueCode() {
    try {
        const codes = readAccessCodes();
        let newCode;
        do {
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substr(2, 5);
            newCode = `ACC_${timestamp}${random}`.toUpperCase();
        } while (codes.used_codes.includes(newCode));
        
        // Ajouter le nouveau code à la liste
        codes.used_codes.push(newCode);
        if (saveAccessCodes(codes)) {
            return newCode;
        }
        throw new Error('Failed to save new code');
    } catch (error) {
        console.error('Error generating unique code:', error);
        return null;
    }
}

// Endpoint pour vérifier un code d'accès
app.post('/verify-code', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ valid: false, error: 'Code manquant' });
        }

        const codes = readAccessCodes();
        if (code === 'DEMO123' || codes.used_codes.includes(code)) {
            res.json({ valid: true });
        } else {
            res.json({ valid: false });
        }
    } catch (error) {
        console.error('Error verifying code:', error);
        res.status(500).json({ valid: false, error: 'Erreur serveur' });
    }
});

// Endpoint pour générer un nouveau code
app.post('/generate-code', async (req, res) => {
    try {
        const newCode = generateUniqueCode();
        if (!newCode) {
            return res.status(500).json({ error: 'Impossible de générer un nouveau code' });
        }
        res.json({ code: newCode });
    } catch (error) {
        console.error('Error generating code:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/create-checkout-session', async (req, res) => {
    try {
        console.log('Création d\'une session de paiement Stripe...');
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: 'Accès à l\'ebook Business Automatisé avec l\'IA',
                        description: 'Accès complet à tous les chapitres de l\'ebook',
                    },
                    unit_amount: 1000, // 10.00 EUR en centimes
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/chapitre1.html`,
        });

        console.log('Session créée:', session.id);
        console.log('URL de redirection:', session.url);
        
        if (!session.url) {
            throw new Error('URL de redirection manquante');
        }
        
        res.json({ url: session.url });
    } catch (error) {
        console.error('Erreur Stripe:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint pour gérer le webhook Stripe
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = 'whsec_votre_secret_webhook'; // À remplacer par votre secret webhook Stripe

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Erreur de signature webhook:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Gestion des événements
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Générer un code d'accès
        const accessCode = generateUniqueCode();
        if (!accessCode) {
            console.error('Erreur lors de la génération du code d\'accès');
            return res.status(500).send('Erreur lors de la génération du code d\'accès');
        }

        // Stocker le code avec l'ID de session pour la récupération ultérieure
        const codes = readAccessCodes();
        if (!codes.sessions) codes.sessions = {};
        codes.sessions[session.id] = accessCode;
        saveAccessCodes(codes);
    }

    res.json({received: true});
});

// Endpoint pour récupérer le code d'accès après le paiement
app.get('/get-access-code/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    const codes = readAccessCodes();
    
    if (codes.sessions && codes.sessions[sessionId]) {
        res.json({ code: codes.sessions[sessionId] });
    } else if (codes.bolt_transactions && codes.bolt_transactions[sessionId]) {
        res.json({ code: codes.bolt_transactions[sessionId] });
    } else {
        res.status(404).json({ error: 'Code d\'accès non trouvé' });
    }
});

// Endpoint pour créer une session de paiement Bolt
app.post('/create-bolt-transaction', async (req, res) => {
    try {
        console.log('Création d\'une session de paiement Bolt...');
        const transaction = await bolt.transactions.create({
            amount: {
                currency: 'EUR',
                amount: 1000 // 10.00 EUR en centimes
            },
            description: 'Accès à l\'ebook Business Automatisé avec l\'IA',
            reference: 'EBOOK-' + Date.now(),
            success_url: `${req.protocol}://${req.get('host')}/success.html?bolt_transaction={TRANSACTION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/chapitre1.html`,
        });

        console.log('Transaction Bolt créée:', transaction.id);
        res.json({ url: transaction.checkout_url });
    } catch (error) {
        console.error('Erreur Bolt:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook pour Bolt
app.post('/bolt-webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const signature = req.headers['bolt-signature'];
    const webhookSecret = 'your_bolt_webhook_secret'; // Remplacez par votre secret webhook Bolt

    try {
        const event = bolt.webhooks.constructEvent(req.body, signature, webhookSecret);
        
        if (event.type === 'transaction.succeeded') {
            const transaction = event.data;
            
            // Générer un code d'accès
            const accessCode = generateUniqueCode();
            if (!accessCode) {
                console.error('Erreur lors de la génération du code d\'accès');
                return res.status(500).send('Erreur lors de la génération du code d\'accès');
            }

            // Stocker le code avec l'ID de transaction
            const codes = readAccessCodes();
            if (!codes.bolt_transactions) codes.bolt_transactions = {};
            codes.bolt_transactions[transaction.id] = accessCode;
            saveAccessCodes(codes);
        }

        res.json({received: true});
    } catch (err) {
        console.error('Erreur de signature webhook Bolt:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
}); 