const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));
// To parse JSON & urlencoded form data (non-file fields)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer setup to save uploaded prescriptions to /uploads folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});
const upload = multer({ 
  storage,
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB
});

// Endpoint to serve doctor name from DV_CODES.json
app.get('/doctor/:code', (req, res) => {
  const code = req.params.code;
  const filePath = path.join(__dirname, 'dv_codes.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading dv_codes.json:', err);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
    let dvData;
    try {
      dvData = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'JSON parse error' });
    }
    // Case-insensitive search for the code, trimming spaces
    const searchCode = code.trim().toLowerCase();
    const foundKey = Object.keys(dvData).find(
      k => k.trim().toLowerCase() === searchCode
    );
    const doctorObj = foundKey ? dvData[foundKey] : null;
    if (doctorObj) {
      res.json({
        success: true,
        doctor: doctorObj.name || doctorObj,
        products: doctorObj.products || []
      });
    } else {
      res.json({ success: false });
    }
  });
});

// New endpoint to serve products for a specific doctor code
app.get('/products/:code', (req, res) => {
  const code = req.params.code;
  const filePath = path.join(__dirname, 'dv_codes.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading dv_codes.json:', err);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
    let dvData;
    try {
      dvData = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'JSON parse error' });
    }
    const searchCode = code.trim().toLowerCase();
    const foundKey = Object.keys(dvData).find(
      k => k.trim().toLowerCase() === searchCode
    );
    const doctorObj = foundKey ? dvData[foundKey] : null;
    if (doctorObj && doctorObj.products) {
      res.json(doctorObj.products);
    } else {
      res.json([]);
    }
  });
});

// Endpoint to get Stripe publishable key
app.get('/config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

// Create payment intent endpoint with enhanced receipt details
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, products, customerInfo, formData } = req.body;
    
    // Validate amount (convert to cents for Stripe)
    const amountInCents = Math.round(amount * 100);
    
    if (amountInCents < 50) { // Minimum 0.50 EUR
      return res.status(400).json({ 
        success: false, 
        error: 'Le montant minimum est de 0.50 €' 
      });
    }

    // Extract customer info and doctor information
    const customerName = customerInfo?.fullName || 'Client';
    const doctorName = formData?.doctorName || 'Médecin non spécifié';
    const depositCode = formData?.depositCode || 'N/A';
    
    console.log('📧 Creating payment intent with enhanced receipt data:');
    console.log('Customer:', customerName);
    console.log('Doctor:', doctorName);
    console.log('Deposit Code:', depositCode);
    console.log('Products received:', products);

    // Build the EXACT description that will appear in the Stripe receipt email
    let detailedProductList = '';
    if (products && products.length > 0) {
      // Create concise but detailed product breakdown: "Product x Qty = Total€"
      detailedProductList = products.map(p => {
        const name = p.name || 'Produit';
        const qty = p.quantity || 1;
        const total = (p.price * qty).toFixed(2);
        return `${name} x${qty} = ${total}€`;
      }).join(' | ');
    } else {
      detailedProductList = 'Produits non spécifiés';
    }
    
    // Format: "FIDIA - [Customer] - Dr.[Doctor] (DV:[Code]) - [Products] - TOTAL: [Amount]€"
    const fullReceiptDescription = `FIDIA - ${customerName} - Dr.${doctorName} (DV:${depositCode}) - ${detailedProductList} - TOTAL: ${amount.toFixed(2)}€`;
    
    // Ensure description fits in Stripe's limits (1000 chars max)
    let finalReceiptDescription;
    if (fullReceiptDescription.length <= 1000) {
      finalReceiptDescription = fullReceiptDescription;
    } else {
      // Fallback: shorter but still informative
      finalReceiptDescription = `FIDIA - ${customerName} - Dr.${doctorName} (${depositCode}) - ${products.length} produit(s) - TOTAL: ${amount.toFixed(2)}€`;
    }

    console.log('📧 FINAL receipt description for Stripe email:', finalReceiptDescription);
    console.log('📧 Description length:', finalReceiptDescription.length, 'characters');

    // Prepare metadata for Stripe
    const metadata = {
      customerName: customerInfo.fullName || '',
      customerEmail: customerInfo.email || '',
      customerAddress: (customerInfo.address || '').substring(0, 490),
      depositCode: depositCode,
      doctorName: doctorName,
      orderAmount: amount.toString(),
      productCount: products.length.toString(),
      // Store products as JSON (first 490 chars)
      products: JSON.stringify(products).substring(0, 490),
      orderDate: new Date().toISOString().split('T')[0],
      orderTime: new Date().toLocaleTimeString('fr-FR')
    };

    console.log('📧 Creating Stripe payment intent with receipt description...');

    // Create payment intent - THE DESCRIPTION FIELD CONTROLS THE RECEIPT EMAIL
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      metadata,
      // ⭐ THIS IS THE KEY FIELD - controls what appears in receipt emails
      description: finalReceiptDescription,
      receipt_email: customerInfo.email,
      // Optional: customize bank statement descriptor
      statement_descriptor: 'FIDIA PHARMA',
      statement_descriptor_suffix: depositCode ? depositCode.substring(0, 10) : undefined
    });

    console.log('✅ Payment intent created successfully!');
    console.log('✅ Payment Intent ID:', paymentIntent.id);
    console.log('✅ Receipt email will be sent to:', customerInfo.email);
    console.log('✅ Receipt will show description:', paymentIntent.description);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      // Return description for debugging
      receiptDescription: paymentIntent.description
    });
  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Handle successful payment with comprehensive data logging
app.post('/payment-success', async (req, res) => {
  try {
    const { paymentIntentId, formData } = req.body;
    
    // Verify the payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Prepare comprehensive payment record with all form data
      const paymentData = {
        paymentIntentId,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: 'completed',
        
        // Customer information
        customerInfo: {
          fullName: formData.customerInfo.fullName,
          email: formData.customerInfo.email,
          address: formData.customerInfo.address
        },
        
        // Order details including doctor and deposit code
        orderDetails: {
          depositCode: formData.orderDetails?.depositCode || paymentIntent.metadata.depositCode,
          doctorName: formData.orderDetails?.doctorName || paymentIntent.metadata.doctorName,
          products: formData.products,
          orderDate: new Date().toISOString().split('T')[0],
          orderTime: new Date().toLocaleTimeString('fr-FR'),
          totalAmount: paymentIntent.amount / 100,
          hasUploadedFile: formData.orderDetails?.hasUploadedFile || false,
          uploadedFileName: formData.orderDetails?.uploadedFileName || null
        },
        
        // Payment method details
        paymentMethod: paymentIntent.payment_method,
        
        // Complete Stripe metadata
        stripeMetadata: paymentIntent.metadata,
        
        // Timestamps
        createdAt: new Date().toISOString(),
        paidAt: new Date(paymentIntent.created * 1000).toISOString()
      };

      // Save to payments.json file
      const paymentsPath = path.join(__dirname, 'payments.json');
      let payments = [];
      if (fs.existsSync(paymentsPath)) {
        const existing = fs.readFileSync(paymentsPath, 'utf8');
        payments = existing ? JSON.parse(existing) : [];
      }
      payments.push(paymentData);
      fs.writeFileSync(paymentsPath, JSON.stringify(payments, null, 2));

      // Also save to submissions.json for form tracking
      const submissionsPath = path.join(__dirname, 'submissions.json');
      let submissions = [];
      if (fs.existsSync(submissionsPath)) {
        const existing = fs.readFileSync(submissionsPath, 'utf8');
        submissions = existing ? JSON.parse(existing) : [];
      }
      
      const submissionData = {
        paymentIntentId,
        form: {
          depositCode: formData.orderDetails?.depositCode,
          doctorName: formData.orderDetails?.doctorName,
          fullName: formData.customerInfo.fullName,
          email: formData.customerInfo.email,
          address: formData.customerInfo.address,
          products: formData.products
        },
        prescriptionFile: formData.orderDetails?.uploadedFileName || null,
        paymentAmount: paymentIntent.amount / 100,
        submittedAt: new Date().toISOString(),
        status: 'completed'
      };
      
      submissions.push(submissionData);
      fs.writeFileSync(submissionsPath, JSON.stringify(submissions, null, 2));

      // Log comprehensive transaction details
      console.log('✅ Payment and form data saved successfully:');
      console.log(`   Customer: ${formData.customerInfo.fullName} (${formData.customerInfo.email})`);
      console.log(`   Doctor: ${formData.orderDetails?.doctorName} (DV: ${formData.orderDetails?.depositCode})`);
      console.log(`   Amount: ${(paymentIntent.amount / 100).toFixed(2)} €`);
      console.log(`   Products: ${formData.products.length} items`);
      console.log(`   File uploaded: ${formData.orderDetails?.hasUploadedFile ? 'Yes' : 'No'}`);
      console.log(`   Payment ID: ${paymentIntentId}`);

      res.json({
        success: true,
        message: 'Paiement confirmé avec succès',
        paymentId: paymentIntentId,
        receiptSent: true,
        orderSummary: {
          orderId: paymentIntentId.substring(3, 10).toUpperCase(),
          totalAmount: paymentIntent.amount / 100,
          productsCount: formData.products.length,
          customerEmail: formData.customerInfo.email,
          formSaved: true
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Le paiement n\'a pas été validé'
      });
    }
  } catch (error) {
    console.error('Error confirming payment and saving form:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la confirmation du paiement'
    });
  }
});

// New endpoint to handle file upload separately (for when files are uploaded before payment)
app.post('/upload-prescription', (req, res) => {
  upload.single('prescription')(req, res, function (err) {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        message: 'Le fichier est trop volumineux (max 3 Mo).' 
      });
    } else if (err) {
      return res.status(400).json({ 
        success: false, 
        message: 'Erreur lors du téléchargement du fichier.' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucun fichier reçu.' 
      });
    }

    // Save file info temporarily (can be linked to payment later)
    const fileData = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Fichier téléchargé avec succès',
      file: fileData
    });
  });
});

// Enhanced endpoint to create detailed invoice with line items (optional upgrade)
app.post('/create-detailed-invoice', async (req, res) => {
  try {
    const { amount, products, customerInfo, formData } = req.body;
    
    // Create customer first
    const customer = await stripe.customers.create({
      email: customerInfo.email,
      name: customerInfo.fullName,
      address: customerInfo.address ? {
        line1: customerInfo.address,
        country: 'FR'
      } : undefined,
      metadata: {
        depositCode: formData?.depositCode || '',
        doctorName: formData?.doctorName || ''
      }
    });

    // Create invoice with detailed line items
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      auto_advance: false,
      collection_method: 'send_invoice',
      days_until_due: 30,
      description: `Commande Fidia Pharma - Dr. ${formData?.doctorName || 'N/A'} (DV: ${formData?.depositCode || 'N/A'})`,
      metadata: {
        doctorName: formData?.doctorName || '',
        depositCode: formData?.depositCode || '',
        orderDate: new Date().toISOString()
      }
    });

    // Add each product as a separate line item
    for (const product of products) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        amount: Math.round(product.price * product.quantity * 100), // Convert to cents
        currency: 'eur',
        description: `${product.name} (Dr. ${formData?.doctorName || 'N/A'})`,
        quantity: product.quantity,
        unit_amount: Math.round(product.price * 100)
      });
    }

    // Finalize the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    res.json({
      success: true,
      invoiceId: finalizedInvoice.id,
      invoiceUrl: finalizedInvoice.hosted_invoice_url,
      paymentIntentId: finalizedInvoice.payment_intent
    });

  } catch (error) {
    console.error('Error creating detailed invoice:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  Warning: STRIPE_SECRET_KEY not found in environment variables');
  }
});
