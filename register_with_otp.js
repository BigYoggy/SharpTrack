const API_URL = 'http://localhost:3000';
const phone = '1234567890';
const pin = '123456';
const name = 'Test User';
const otp = '798453'; // From server logs

async function register() {
    try {
        console.log('1. Verifying OTP...');
        const verifyRes = await fetch(`${API_URL}/api/otp/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp })
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) {
            throw new Error(verifyData.error || 'Verification failed');
        }
        console.log('OTP verified successfully!');

        console.log('2. Registering User...');
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
