const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');
// Use a verified domain if possible. Using resend.dev for testing.
const FROM_EMAIL = process.env.EMAIL_FROM || 'SharpTrack <onboarding@resend.dev>'; 

async function sendEmailOTP(email, otp) {
    try {
        const response = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: 'Your SharpTrack Verification Code',
            html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; text-align: center;">
                    <h2 style="color: #333;">Verify Your Email</h2>
                    <p style="color: #555; font-size: 16px;">Use the following verification code to complete your registration:</p>
                    <div style="background-color: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h1 style="margin: 0; letter-spacing: 5px; color: #18181b;">${otp}</h1>
                    </div>
                    <p style="color: #71717a; font-size: 14px;">This code will expire in 10 minutes.</p>
                </div>
            `
        });
        
        if (response.error) {
            throw new Error(response.error.message || 'Resend API Error');
        }
        
        return { success: true, data: response.data };
    } catch (error) {
        console.error('[Resend OTP Error]:', error);
        throw error;
    }
}

async function sendCongratulationMail(email, name, storeName) {
    try {
        const response = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: 'Welcome to SharpTrack! 🎉',
            html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #333;">Congratulations, ${name}!</h2>
                    <p style="color: #555; font-size: 16px; line-height: 1.5;">
                        You have successfully set up your workspace for <strong>${storeName}</strong>. 
                        We are thrilled to have you on board.
                    </p>
                    <p style="color: #555; font-size: 16px; line-height: 1.5;">
                        SharpTrack is built to help you track inventory flawlessly, manage sales smoothly, and give you complete control over your business.
                    </p>
                    <div style="text-align: center; margin-top: 40px;">
                        <a href="https://sharptrack.space/dashboard.html" style="background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">Go to Dashboard</a>
                    </div>
                    <hr style="border: none; border-top: 1px solid #eaeaea; margin: 40px 0 20px 0;" />
                    <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
                        &copy; ${new Date().getFullYear()} SharpTrack. All rights reserved.
                    </p>
                </div>
            `
        });
        
        if (response.error) {
            throw new Error(response.error.message || 'Resend API Error');
        }
        
        return { success: true, data: response.data };
    } catch (error) {
        console.error('[Resend Congratulation Error]:', error);
        throw error;
    }
}

module.exports = { sendEmailOTP, sendCongratulationMail };
