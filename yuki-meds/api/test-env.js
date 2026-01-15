// Test endpoint to check environment variables
export default function handler(req, res) {
  return res.status(200).json({
    FB_PAGE_ACCESS_TOKEN: process.env.FB_PAGE_ACCESS_TOKEN ? 'SET' : 'NOT_SET',
    FB_VERIFY_TOKEN: process.env.FB_VERIFY_TOKEN ? 'SET' : 'NOT_SET',
    FB_VERIFY_TOKEN_VALUE: process.env.FB_VERIFY_TOKEN || 'undefined'
  });
}
