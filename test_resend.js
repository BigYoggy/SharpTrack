require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
    try {
        console.log("Using API Key starting with:", process.env.RESEND_API_KEY.substring(0, 5));
        console.log("Sending from:", process.env.EMAIL_FROM);
        
        const data = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: 'yotan748@gmail.com',
            subject: 'Test Email',
            html: '<p>This is a test email.</p>'
        });
        
        console.log('Success:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

testEmail();
