# Quote Tool Preview — Local Viewing

This preview is ready in `quote-tool-app`.

## Start it

From the workspace root:

```powershell
cd C:\Users\IkeFl\.openclaw\workspace\quote-tool-app
npm install
npm run dev
```

Wait for Next.js to say the app is ready.

## Open it

Open this URL in your browser:

- http://localhost:3000/

## What you should see

- The proposal shell preview
- A toggle at the top for:
  - **Section A: Pool**
  - **Section A: Per Kit**

## Note

I fixed the preview so it now reads from the newer nested quote record model instead of the older flat demo shape. That means the local preview should render cleanly from the current sample quote data.
