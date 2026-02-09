# Open Graph Image Generation Instructions

Since we don't have an actual PNG file, here are instructions for creating the Open Graph image:

1. **Create an 1200x630 PNG image** with the following content:
   - Background: Dark gradient (similar to the app's theme)
   - Logo: DocuMint AI logo centered
   - Text: "DocuMint AI - Intelligent Documentation"
   - Subtext: "AI-Powered Code Documentation Generation"
   - Colors: Use blue/purple gradient theme matching the app

2. **Alternative quick solution**: Use a service like:
   - Vercel OG Image Generation: https://og-image.vercel.app/
   - Canva template
   - Figma template

3. **Or generate programmatically** using a service like:
   ```bash
   # Install og-image generation tool
   npm install -g @vercel/og
   ```

Once you have the PNG file, save it as `public/og-image.png`.

**Temporary solution**: You can use a placeholder service like:
- https://via.placeholder.com/1200x630/1e293b/ffffff?text=DocuMint+AI
- Add this URL to replace the placeholder temporarily

For now, I'll update the layout to use a placeholder image:

```typescript
images: [
  {
    url: "https://via.placeholder.com/1200x630/1e293b/ffffff?text=DocuMint+AI",
    width: 1200,
    height: 630,
    alt: "DocuMint AI Preview",
  },
],
