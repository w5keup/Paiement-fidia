// Global variables
let stripe = null;
let elements = null;
let cardElement = null;
let currentDoctorProducts = [];
let qrCodeReader = null;
let currentStream = null;
let facingMode = 'environment'; // Start with back camera

// Initialize Stripe and setup
document.addEventListener('DOMContentLoaded', async function() {
  // Initialize Stripe
  try {
    const configResponse = await fetch('/config');
    const config = await configResponse.json();
    stripe = Stripe(config.publishableKey);

    // Initialize Elements
    elements = stripe.elements();
    setupCardElement();

    // Setup Payment Request Button for Apple Pay / Google Pay
    setupPaymentRequestButton();
  } catch (error) {
    console.error('Error initializing Stripe:', error);
  }

  // Setup splash screen
  setupSplashScreen();
  
  // Setup form functionality
  setupDoctorLookup();
  setupQRScanner();
  setupPaymentHandler();
  
  // Fix layout issues
  fixLayoutIssues();
});

// Setup Stripe Card Element
function setupCardElement() {
  if (!elements) return;
  
  // Create card element with custom styling
  cardElement = elements.create('card', {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
        padding: '12px',
      },
      invalid: {
        color: '#9e2146',
      },
    },
    hidePostalCode: true, // We collect address separately
  });

  // Mount the card element
  cardElement.mount('#card-element');

  // Handle real-time validation errors from the card Element
  cardElement.on('change', ({error}) => {
    const displayError = document.getElementById('card-errors');
    const payBtn = document.getElementById('payBtn');
    
    if (error) {
      displayError.textContent = error.message;
      payBtn.disabled = true;
    } else {
      displayError.textContent = '';
      // Enable pay button if we have products selected
      const total = parseFloat(document.getElementById('productsTotal').textContent) || 0;
      payBtn.disabled = total < 0.50;
    }
  });

  // Enable pay button when card is ready and valid
  cardElement.on('ready', () => {
    console.log('Card Element ready');
    updatePayButtonState();
  });
}

// Update pay button state based on form validation
function updatePayButtonState() {
  const payBtn = document.getElementById('payBtn');
  const total = parseFloat(document.getElementById('productsTotal').textContent) || 0;
  const hasValidCard = cardElement && !document.getElementById('card-errors').textContent;
  
  payBtn.disabled = !hasValidCard || total < 0.50;
}

// Splash screen handling
function setupSplashScreen() {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    const body = document.body;
    
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(() => {
        body.classList.remove('splash-active');
        setTimeout(() => {
          splash.style.display = 'none';
        }, 300);
      }, 1200);
    }
  }, 1000);
}

// Doctor lookup functionality
function setupDoctorLookup() {
  const depositCodeInput = document.getElementById('depositCode');
  const doctorNameInput = document.getElementById('doctorName');
  const doctorInfoDiv = document.getElementById('doctorInfo');

  if (!depositCodeInput) return;

  depositCodeInput.addEventListener('change', async (e) => {
    const code = e.target.value.trim();
    if (!code) {
      hidedoctorInfo();
      return;
    }

    doctorNameInput.value = 'Recherche...';
    doctorInfoDiv.classList.remove('hidden');

    try {
      const response = await fetch(`/doctor/${encodeURIComponent(code)}`);
      const data = await response.json();
      
      if (data.success && data.doctor) {
        doctorNameInput.value = data.doctor;
        doctorNameInput.dataset.valid = "1";
        
        // Store products globally
        currentDoctorProducts = data.products || [];
        console.log('Products loaded:', currentDoctorProducts);
        
        // Update products in step 3 if currently visible
        renderProducts();
      } else {
        doctorNameInput.value = 'Médecin non trouvé';
        doctorNameInput.dataset.valid = "0";
        currentDoctorProducts = [];
        renderProducts();
      }
    } catch (error) {
      console.error('Error fetching doctor:', error);
      doctorNameInput.value = 'Erreur de connexion';
      doctorNameInput.dataset.valid = "0";
      currentDoctorProducts = [];
      renderProducts();
    }
  });
}

function hidedoctorInfo() {
  const doctorInfoDiv = document.getElementById('doctorInfo');
  const doctorNameInput = document.getElementById('doctorName');
  if (doctorInfoDiv) doctorInfoDiv.classList.add('hidden');
  if (doctorNameInput) {
    doctorNameInput.value = '';
    doctorNameInput.dataset.valid = "0";
  }
  currentDoctorProducts = [];
  renderProducts();
}

// QR Code Scanner functionality
function setupQRScanner() {
  const qrScanToggle = document.getElementById('qrScanToggle');
  const qrScannerContainer = document.getElementById('qrScannerContainer');
  const qrVideo = document.getElementById('qrVideo');
  const qrStopBtn = document.getElementById('qrStopBtn');
  const qrSwitchCamera = document.getElementById('qrSwitchCamera');
  const qrScanText = document.getElementById('qrScanText');
  const qrScanStatus = document.getElementById('qrScanStatus');
  const qrScanResult = document.getElementById('qrScanResult');

  if (!qrScanToggle) return;

  // Initialize QR Code Reader
  if (typeof ZXing !== 'undefined') {
    qrCodeReader = new ZXing.BrowserQRCodeReader();
  }

  qrScanToggle.addEventListener('click', async () => {
    if (qrScannerContainer.classList.contains('hidden')) {
      await startQRScanner();
    } else {
      stopQRScanner();
    }
  });

  qrStopBtn.addEventListener('click', () => {
    stopQRScanner();
  });

  qrSwitchCamera.addEventListener('click', async () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    if (!qrScannerContainer.classList.contains('hidden')) {
      stopQRScanner();
      await startQRScanner();
    }
  });

  async function startQRScanner() {
    try {
      if (!qrCodeReader) {
        showErrorPopup('Scanner QR non disponible. Veuillez saisir le code manuellement.');
        return;
      }

      qrScanText.textContent = '📷 Arrêt en cours...';
      qrScanToggle.disabled = true;

      // Request camera permission
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };

      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      qrVideo.srcObject = currentStream;

      qrScannerContainer.classList.remove('hidden');
      qrScanText.textContent = '📷 Scanner actif';
      qrScanToggle.disabled = false;
      qrScanStatus.textContent = 'Positionnez le QR code dans le cadre';

      // Start scanning
      qrCodeReader.decodeFromVideoDevice(undefined, qrVideo, (result, error) => {
        if (result) {
          const scannedText = result.getText();
          console.log('QR Code scanné:', scannedText);
          
          // Extract DV code from scanned text
          const dvCode = extractDVCode(scannedText);
          if (dvCode) {
            document.getElementById('depositCode').value = dvCode;
            document.getElementById('depositCode').dispatchEvent(new Event('change'));
            
            qrScanResult.textContent = `✅ Code scanné: ${dvCode}`;
            qrScanResult.style.color = '#22c55e';
            qrScanResult.style.display = 'block';
            
            setTimeout(() => {
              stopQRScanner();
            }, 2000);
          } else {
            qrScanResult.textContent = `❌ QR code invalide: ${scannedText}`;
            qrScanResult.style.color = '#ef4444';
            qrScanResult.style.display = 'block';
          }
        }
        
        if (error && error.name !== 'NotFoundException') {
          console.warn('QR scan error:', error);
        }
      });

    } catch (error) {
      console.error('Erreur caméra:', error);
      let errorMessage = 'Impossible d\'accéder à la caméra.';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Accès à la caméra refusé. Veuillez autoriser l\'accès et réessayer.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'Aucune caméra trouvée sur cet appareil.';
      }
      
      showErrorPopup(errorMessage);
      qrScanText.textContent = '📷 Activer la caméra';
      qrScanToggle.disabled = false;
    }
  }

  function stopQRScanner() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    
    if (qrCodeReader) {
      qrCodeReader.reset();
    }
    
    qrVideo.srcObject = null;
    qrScannerContainer.classList.add('hidden');
    qrScanText.textContent = '📷 Activer la caméra';
    qrScanToggle.disabled = false;
    
    setTimeout(() => {
      qrScanResult.style.display = 'none';
    }, 3000);
  }

  function extractDVCode(scannedText) {
    // Try to extract DV code from various QR code formats
    scannedText = scannedText.trim();
    
    // Direct DV code (e.g., "DV123")
    if (/^DV\d+$/i.test(scannedText)) {
      return scannedText.toUpperCase();
    }
    
    // JSON format: {"dv": "DV123", ...}
    try {
      const parsed = JSON.parse(scannedText);
      if (parsed.dv || parsed.code || parsed.depositCode) {
        const code = parsed.dv || parsed.code || parsed.depositCode;
        if (/^DV\d+$/i.test(code)) {
          return code.toUpperCase();
        }
      }
    } catch (e) {
      // Not JSON, continue
    }
    
    // URL format: https://example.com/doctor?dv=DV123
    const urlMatch = scannedText.match(/[?&]dv=([^&]+)/i);
    if (urlMatch && /^DV\d+$/i.test(urlMatch[1])) {
      return urlMatch[1].toUpperCase();
    }
    
    // Text with DV code: "Doctor: Dr. Smith, Code: DV123"
    const textMatch = scannedText.match(/DV\d+/i);
    if (textMatch) {
      return textMatch[0].toUpperCase();
    }
    
    return null;
  }
}

// Products rendering
function renderProducts() {
  const productsContainer = document.getElementById('productsContainer');
  const totalSpan = document.getElementById('productsTotal');
  // New: get the other total spans
  const tvaSpan = document.querySelectorAll('#productsTotal')[1];
  const ttcSpan = document.querySelectorAll('#productsTotal')[2];

  if (!productsContainer || !totalSpan || !tvaSpan || !ttcSpan) return;

  if (!currentDoctorProducts || currentDoctorProducts.length === 0) {
    productsContainer.innerHTML = `
      <div class="text-gray-500 text-center py-8">
        <div class="text-4xl mb-2">🏥</div>
        <div>Aucun produit disponible</div>
        <div class="text-sm mt-1">Vérifiez le DV</div>
      </div>
    `;
    totalSpan.textContent = "0.00";
    tvaSpan.textContent = "0.00";
    ttcSpan.textContent = "0.00";
    updatePayButtonState();
    return;
  }

  // Show both HT and TTC for each product
  productsContainer.innerHTML = currentDoctorProducts.map((product, idx) => {
    const priceHT = product.price || 0;
    const priceTTC = (priceHT * 1.2).toFixed(2);
    return `
      <div class="flex items-center justify-between border-b py-3 last:border-b-0">
        <div class="flex-1 min-w-0 pr-4">
          <div class="font-semibold text-sm break-words">${product.name}</div>
          <div class="text-xs text-gray-500">
            ${priceHT.toFixed(2)} € HT / unité<br>
            ${priceTTC} € TTC / unité
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="qty-btn w-8 h-8 flex items-center justify-center rounded-full bg-red-100 text-red-600 font-bold hover:bg-red-200" data-idx="${idx}" data-action="sub">−</button>
          <input type="number" min="0" value="0" data-price="${priceHT}" 
                 class="product-qty border rounded w-16 text-center py-1" />
          <button type="button" class="qty-btn w-8 h-8 flex items-center justify-center rounded-full bg-green-100 text-green-600 font-bold hover:bg-green-200" data-idx="${idx}" data-action="add">+</button>
        </div>
      </div>
    `;
  }).join('');

  // Setup quantity controls and total calculation
  setupQuantityControls();
}

function setupQuantityControls() {
  const productsContainer = document.getElementById('productsContainer');
  const totalSpan = document.getElementById('productsTotal');
  // New: get the other total spans
  const tvaSpan = document.querySelectorAll('#productsTotal')[1];
  const ttcSpan = document.querySelectorAll('#productsTotal')[2];

  if (!productsContainer || !totalSpan || !tvaSpan || !ttcSpan) return;

  const qtyInputs = productsContainer.querySelectorAll('.product-qty');
  const qtyBtns = productsContainer.querySelectorAll('.qty-btn');

  function updateTotal() {
    let totalHT = 0;
    qtyInputs.forEach(input => {
      const price = parseFloat(input.getAttribute('data-price')) || 0;
      const qty = parseInt(input.value, 10) || 0;
      totalHT += price * qty;
    });
    const tva = totalHT * 0.20;
    const totalTTC = totalHT + tva;
    totalSpan.textContent = totalHT.toFixed(2);
    tvaSpan.textContent = tva.toFixed(2);
    ttcSpan.textContent = totalTTC.toFixed(2);
    updatePayButtonState(); // Update button state when total changes
  }

  // Input change listeners
  qtyInputs.forEach(input => {
    input.addEventListener('input', updateTotal);
    input.addEventListener('change', updateTotal);
  });

  // Button click listeners
  qtyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.getAttribute('data-idx');
      const action = btn.getAttribute('data-action');
      const input = qtyInputs[idx];

      if (!input) return;

      let val = parseInt(input.value, 10) || 0;
      if (action === 'add') {
        val++;
      } else if (action === 'sub' && val > 0) {
        val--;
      }

      input.value = val;
      updateTotal();
    });
  });

  updateTotal();
}

// Setup Stripe Payment Request Button (Apple Pay / Google Pay)
function setupPaymentRequestButton() {
  if (!stripe || !elements) return;

  // Calculate TTC total from products (fallback to 1 EUR)
  let total = parseFloat(document.querySelectorAll('#productsTotal')[2]?.textContent) || 1;

  // PaymentRequest object
  const paymentRequest = stripe.paymentRequest({
    country: 'FR',
    currency: 'eur',
    total: {
      label: 'Total',
      amount: Math.round(total * 100),
    },
    requestPayerName: true,
    requestPayerEmail: true,
    requestPayerPhone: false,
    requestShipping: false,
    // supportedNetworks is not needed, Stripe handles this
  });

  // Create the Payment Request Button
  const prButton = elements.create('paymentRequestButton', {
    paymentRequest: paymentRequest,
    style: {
      paymentRequestButton: {
        type: 'default',
        theme: 'dark',
        height: '44px',
      }
    }
  });

  // Check if the Payment Request is available (Apple Pay/Google Pay)
  paymentRequest.canMakePayment().then(function(result) {
    const prBtnDiv = document.getElementById('payment-request-button');
    if (result && prBtnDiv) {
      prButton.mount('#payment-request-button');
      prBtnDiv.style.display = '';
    } else if (prBtnDiv) {
      prBtnDiv.style.display = 'none';
    }
  });

  // Update the payment request total dynamically when product quantities change
  const updatePaymentRequestTotal = () => {
    const selectedProducts = getSelectedProducts();
    let total = selectedProducts.reduce((sum, p) => sum + (p.ttc * p.quantity), 0);
    if (total < 0.5) total = 0.5; // Stripe minimum
    paymentRequest.update({
      total: {
        label: 'Total',
        amount: Math.round(total * 100),
      }
    });
  };

  // Initial update
  updatePaymentRequestTotal();

  // Listen for changes in product quantities
  const productsContainer = document.getElementById('productsContainer');
  if (productsContainer) {
    productsContainer.addEventListener('input', updatePaymentRequestTotal);
  }

  // Handle Payment Request events
  paymentRequest.on('paymentmethod', async (ev) => {
    // Get selected products and customer info
    const selectedProducts = getSelectedProducts();
    const total = selectedProducts.reduce((sum, p) => sum + (p.ttc * p.quantity), 0);
    const customerInfo = {
      fullName: document.getElementById('fullName').value,
      email: document.getElementById('email').value,
      address: document.getElementById('address').value
    };
    const formData = {
      depositCode: document.getElementById('depositCode').value,
      doctorName: document.getElementById('doctorName').value,
      customerInfo,
      products: selectedProducts
    };

    // Create payment intent on the server
    let clientSecret;
    try {
      const response = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: total,
          products: selectedProducts,
          customerInfo,
          formData
        })
      });
      const data = await response.json();
      clientSecret = data.clientSecret;
    } catch (err) {
      ev.complete('fail');
      showErrorPopup('Erreur lors de la création du paiement.');
      return;
    }

    // Confirm the payment with the payment method from Apple Pay / Google Pay
    const {error, paymentIntent} = await stripe.confirmCardPayment(
      clientSecret,
      { payment_method: ev.paymentMethod.id },
      { handleActions: false }
    );

    if (error) {
      ev.complete('fail');
      showErrorPopup(error.message);
      return;
    }

    ev.complete('success');

    if (paymentIntent.status === 'requires_action') {
      // Handle 3D Secure if needed
      const {error: confirmError, paymentIntent: confirmedIntent} = await stripe.confirmCardPayment(clientSecret);
      if (confirmError) {
        showErrorPopup(confirmError.message);
        return;
      }
      if (confirmedIntent.status === 'succeeded') {
        showSuccessPopup('Paiement réussi via Apple Pay / Google Pay !');
        resetForm();
      }
    } else if (paymentIntent.status === 'succeeded') {
      showSuccessPopup('Paiement réussi via Apple Pay / Google Pay !');
      resetForm();
    }
  });
}

// Navigation functions
function goToStep(stepId) {
  // Hide all sections
  document.querySelectorAll('.main-content-section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Show target section
  const targetSection = document.getElementById(stepId);
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // Update progress indicators
  const stepNumber = stepId.replace('step', '');
  updateProgress(stepNumber);
  
  // Render products if going to step 3
  if (stepId === 'step3') {
    renderProducts();
    // Make sure card element is properly mounted
    if (cardElement && document.getElementById('card-element')) {
      setTimeout(() => {
        cardElement.mount('#card-element');
      }, 100);
    }
  }
}

function updateProgress(stepNum) {
  document.querySelectorAll('.progress-row').forEach((row, idx) => {
    row.classList.toggle('active', (idx + 1) == stepNum);
  });
}

// Payment handler
function setupPaymentHandler() {
  const payBtn = document.getElementById('payBtn');
  if (!payBtn) return;

  payBtn.addEventListener('click', async () => {
    if (!validateAllSteps()) return;
    
    const selectedProducts = getSelectedProducts();
    if (selectedProducts.length === 0) {
      showErrorPopup('Veuillez sélectionner au moins un produit.');
      return;
    }

    const total = selectedProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
    if (total < 0.50) {
      showErrorPopup('Le montant minimum est de 0.50 €.');
      return;
    }

    // Proceed with payment
    await processPayment(selectedProducts, total);
  });
}

// Validation functions
function validateAllSteps() {
  // Validate step 1
  const depositCode = document.getElementById('depositCode').value.trim();
  const doctorNameInput = document.getElementById('doctorName');
  if (!depositCode || !doctorNameInput.value || doctorNameInput.dataset.valid !== "1") {
    showErrorPopup('Veuillez saisir un code médecin valide ou scanner le QR code.');
    goToStep('step1');
    return false;
  }

  // Validate step 2
  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const address = document.getElementById('address').value.trim();
  
  if (!fullName) {
    showErrorPopup('Veuillez saisir votre nom complet.');
    goToStep('step2');
    return false;
  }
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showErrorPopup('Veuillez saisir une adresse email valide.');
    goToStep('step2');
    return false;
  }
  return true;
}

function getSelectedProducts() {
  if (!currentDoctorProducts) return [];
  
  const qtyInputs = document.querySelectorAll('.product-qty');
  return Array.from(qtyInputs).map((input, idx) => {
    const quantity = parseInt(input.value, 10) || 0;
    if (quantity > 0 && currentDoctorProducts[idx]) {
      const priceHT = currentDoctorProducts[idx].price;
      const priceTTC = +(priceHT * 1.2).toFixed(2);
      return {
        name: currentDoctorProducts[idx].name,
        price: priceHT,
        ttc: priceTTC,
        quantity
      };
    }
    return null;
  }).filter(Boolean);
}

// Payment processing with Stripe Elements
async function processPayment(products, _amount) {
  if (!stripe || !cardElement) {
    showErrorPopup('Erreur de configuration du paiement.');
    return;
  }

  try {
    // Show loading state
    const payBtn = document.getElementById('payBtn');
    const payBtnText = document.getElementById('payBtnText');
    const payBtnSpinner = document.getElementById('payBtnSpinner');
    
    payBtn.disabled = true;
    payBtnText.textContent = 'Traitement...';
    payBtnSpinner.classList.remove('hidden');

    // Collect form data
    const customerInfo = {
      fullName: document.getElementById('fullName').value,
      email: document.getElementById('email').value,
      address: document.getElementById('address').value
    };

    const formData = {
      depositCode: document.getElementById('depositCode').value,
      doctorName: document.getElementById('doctorName').value,
      customerInfo,
      products
    };

    // Calculate TTC total
    const amount = products.reduce((sum, p) => sum + (p.ttc * p.quantity), 0);

    // Create payment intent
    const response = await fetch('/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        products,
        customerInfo,
        formData
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erreur lors de la création du paiement');
    }

    const { clientSecret } = await response.json();

    // Confirm payment using Stripe Elements
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          name: customerInfo.fullName,
          email: customerInfo.email,
          address: {
            line1: customerInfo.address,
            country: 'FR',
          },
        },
      },
      receipt_email: customerInfo.email,
    });

    if (error) {
      console.error('Payment error:', error);
      throw new Error(error.message);
    }

    if (paymentIntent.status === 'succeeded') {
      // Payment successful
      showSuccessPopup(`✅ Paiement validé ! Montant: ${amount.toFixed(2)}€TTC\nUn email de confirmation vous a été envoyé à l'adresse suivante : ${customerInfo.email}`);
      
      // Optionally clear the form
      resetForm();
    } else {
      throw new Error('Le paiement n\'a pas été confirmé');
    }
    
  } catch (error) {
    console.error('Payment error:', error);
    showErrorPopup('Erreur lors du paiement: ' + error.message);
  } finally {
    // Reset button state
    const payBtn = document.getElementById('payBtn');
    const payBtnText = document.getElementById('payBtnText');
    const payBtnSpinner = document.getElementById('payBtnSpinner');
    
    payBtn.disabled = false;
    payBtnText.textContent = 'Payer maintenant';
    payBtnSpinner.classList.add('hidden');
    updatePayButtonState();
  }
}

// Reset form after successful payment
function resetForm() {
  // Clear all inputs
  document.getElementById('depositCode').value = '';
  document.getElementById('fullName').value = '';
  document.getElementById('email').value = '';
  document.getElementById('address').value = '';
  
  // Hide doctor info
  hidedoctorInfo();
  
  // Stop QR scanner if running
  const qrScannerContainer = document.getElementById('qrScannerContainer');
  if (qrScannerContainer && !qrScannerContainer.classList.contains('hidden')) {
    document.getElementById('qrStopBtn').click();
  }
  
  // Clear card element
  if (cardElement) {
    cardElement.clear();
  }
  
  // Reset to step 1
  goToStep('step1');
}

// Utility functions - Replace browser alerts with custom popups
function showErrorPopup(message) {
  // Create custom error popup instead of browser alert
  createCustomPopup(message, 'error');
}

function showSuccessPopup(message) {
  // Create custom success popup instead of browser alert
  createCustomPopup(message, 'success');
}

function createCustomPopup(message, type = 'info') {
  // Remove any existing popup
  const existingPopup = document.getElementById('customPopup');
  if (existingPopup) {
    existingPopup.remove();
  }

  // Create popup container
  const popup = document.createElement('div');
  popup.id = 'customPopup';
  popup.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100000] backdrop-blur-sm';
  
  // Determine colors based on type
  let bgColor, textColor, iconColor, icon;
  switch (type) {
    case 'error':
      bgColor = 'bg-red-50';
      textColor = 'text-red-800';
      iconColor = 'text-red-600';
      icon = '⚠️';
      break;
    case 'success':
      bgColor = 'bg-green-50';
      textColor = 'text-green-800';
      iconColor = 'text-green-600';
      icon = '✅';
      break;
    default:
      bgColor = 'bg-blue-50';
      textColor = 'text-blue-800';
      iconColor = 'text-blue-600';
      icon = 'ℹ️';
  }

  popup.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md mx-4 transform scale-95 transition-all duration-300">
      <div class="flex items-center mb-4">
        <div class="text-2xl mr-3">${icon}</div>
        <h3 class="text-lg font-semibold ${textColor}">
          ${type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : 'Information'}
        </h3>
      </div>
      <div class="mb-6">
        <p class="text-gray-700 leading-relaxed">${message}</p>
      </div>
      <div class="flex justify-end">
        <button onclick="closeCustomPopup()" 
                class="px-6 py-2 ${type === 'error' ? 'bg-red-600 hover:bg-red-700' : type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-lg font-medium transition-colors duration-200">
          OK
        </button>
      </div>
    </div>
  `;

  // Add to body
  document.body.appendChild(popup);

  // Animate in
  setTimeout(() => {
    const popupContent = popup.querySelector('div');
    if (popupContent) {
      popupContent.style.transform = 'scale(1)';
    }
  }, 10);

  // Auto-close success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      closeCustomPopup();
    }, 3000);
  }
}

function closeCustomPopup() {
  const popup = document.getElementById('customPopup');
  if (popup) {
    const popupContent = popup.querySelector('div');
    if (popupContent) {
      popupContent.style.transform = 'scale(0.95)';
      popupContent.style.opacity = '0';
    }
    setTimeout(() => {
      popup.remove();
    }, 300);
  }
}

function fixLayoutIssues() {
  // Fix any layout issues that might occur
  const sidebar = document.getElementById('sidebar');
  const container = document.querySelector('.flex.rounded-2xl.shadow-2xl.bg-white.overflow-hidden');
  
  if (sidebar && container) {
    sidebar.style.minHeight = '100%';
    container.style.minHeight = '600px';
  }
}

// Initial setup
goToStep('step1');

