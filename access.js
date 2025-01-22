// Configuration Stripe
const stripe = Stripe('pk_test_51QjjbVEjwPvkgqugGyeVjFCtpKWvTlZz076w1yolCXc9KR7C1DcuFXbHocGvt0QEKDVOqdMlDefD24Nr9nZ83k3E00E3rSj5K0');

// Fonction pour débloquer tout le contenu
function unlockAllContent() {
    console.log('Unlocking all content...');
    
    // Marquer l'accès comme autorisé dans le localStorage
    localStorage.setItem('hasAccess', 'true');
    
    // Ajouter la classe content-unlocked au body
    document.body.classList.add('content-unlocked');
    
    // Déflouter les liens de navigation
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        link.style.filter = 'none';
        link.style.opacity = '1';
        link.classList.remove('protected');
    });

    // Déflouter le contenu des chapitres
    const chapterContents = document.querySelectorAll('.chapter-content, .protected-content');
    chapterContents.forEach(content => {
        content.style.filter = 'none';
        content.style.opacity = '1';
    });

    // Cacher l'interface de paiement si elle existe
    const paymentInterface = document.querySelector('.payment-interface');
    if (paymentInterface) {
        paymentInterface.style.display = 'none';
    }
}

// Fonction de validation du code d'accès
async function validateAccessCode() {
    const codeInput = document.getElementById('access-code');
    if (!codeInput || !codeInput.value) {
        alert('Veuillez entrer un code d\'accès');
        return;
    }

    try {
        const response = await fetch('/verify-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: codeInput.value
            })
        });

        const data = await response.json();
        
        if (data.valid) {
            console.log('Access code valid, unlocking content...');
            // Stocke le code d'accès
            localStorage.setItem('accessCode', codeInput.value);
            localStorage.setItem('hasAccess', 'true');
            
            // Débloque tout le contenu
            unlockAllContent();

            // Notifie l'utilisateur
            alert('Accès accordé ! Vous pouvez maintenant accéder à tout le contenu.');
        } else {
            alert('Code invalide');
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Une erreur est survenue lors de la vérification du code');
    }
}

// Vérifier l'accès au chargement de chaque page
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier si l'accès est déjà accordé
    if (localStorage.getItem('hasAccess') === 'true') {
        unlockAllContent();
    }
}); 