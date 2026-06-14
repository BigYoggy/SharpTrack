const API_URL = 'http://localhost:3000';
const phone = '1234567890';
const pin = '123456';
const name = 'Test User';

async function register() {
    try {
        console.log('1. Sending OTP...');
        await fetch(`${API_URL}/api/otp/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        
        // Fetch it from memory
        const { otpStore } = require('./store');
        const record = otpStore[phone];
        if (!record) {
            throw new Error('OTP not found in store');
        }
        const otp = record.otp;
        console.log(`2. Found OTP in memory store: ${otp}`);

        console.log('3. Verifying OTP...');
        await fetch(`${API_URL}/api/otp/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp })
        });

        console.log('4. Registering User...');
        const regRes = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, pin })
        });
        const regData = await regRes.json();
        
        if (!regRes.ok) {
            throw new Error(regData.error || 'Registration failed');
        }

        console.log('Registration successful!');
        console.log('Token:', regData.token);
        console.log('User:', JSON.stringify(regData.user));
    } catch (err) {
        console.error('Error during registration:', err.message);
    }
}

register();
