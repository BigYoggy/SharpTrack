const { Resend } = require('resend');
const resend = new Resend('re_123456789');

resend.emails.send({
    from: 'test@example.com',
    to: 'yotan748@gmail.com',
    subject: 'Bad Key Test',
    html: '<p>test</p>'
})
.then(console.log)
.catch(console.error);
