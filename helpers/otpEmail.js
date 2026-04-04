/**
 * Generates a styled HTML email template for OTP verification.
 * @param {string} otp - The 6-digit verification code.
 * @returns {string} Styled HTML string.
 */
const getOtpTemplate = (otp) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Account</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #FDF8F4; color: #2D3436; }
        .wrapper { width: 100%; padding: 40px 0; display: flex; justify-content: center; background-color: #FDF8F4; }
        .container { max-width: 500px; width: 90%; background: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 10px 30px rgba(137, 93, 57, 0.05); text-align: center; border: 1px solid #F1E4DA; }
        
        .logo { font-size: 24px; font-weight: 800; color: #895D39; letter-spacing: 2px; margin-bottom: 30px; text-transform: uppercase; }
        .divider { height: 1px; background: #EEE; margin: 25px 0; }
        
        h1 { font-size: 26px; font-weight: 800; color: #2D3436; margin-bottom: 12px; }
        p { font-size: 16px; line-height: 1.6; color: #636E72; margin-bottom: 30px; }
        
        .otp-box { background: #FDF8F4; border: 2px dashed #895D39; border-radius: 16px; padding: 25px 0; margin-bottom: 30px; }
        .otp-code { font-size: 42px; font-weight: 800; color: #895D39; letter-spacing: 12px; font-family: 'Courier New', Courier, monospace; }
        
        .security-note { font-size: 13px; color: #B2BEC3; font-weight: 500; font-style: italic; }
        .footer { margin-top: 40px; font-size: 12px; color: #B2BEC3; line-height: 1.5; }
        
        @media only screen and (max-width: 480px) {
            .container { padding: 30px 20px; }
            .otp-code { font-size: 32px; letter-spacing: 8px; }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="logo">Jordan Express</div>
            
            <h1>Verification Code</h1>
            <p>Please use the following single-use code to complete your verification process. Your security is our priority.</p>
            
            <div class="otp-box">
                <div class="otp-code">${otp}</div>
            </div>
            
            <p class="security-note">Valid for the next 10 minutes. Do not share this code with anyone.</p>
            
            <div class="divider"></div>
            
            <div class="footer">
                If you did not request this code, your account is safe. You can simply delete this email.<br>
                &copy; 2026 Jordan Express. All rights reserved.
            </div>
        </div>
    </div>
</body>
</html>
`;

module.exports = { getOtpTemplate };
