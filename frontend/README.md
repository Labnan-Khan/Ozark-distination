# Ozark Destination — V1 Frontend

React + Vite frontend for the Version 1 property rental API.

## Run locally

Start the backend first (PM2 or `npm run dev` in `backend/`), then:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

The API base URL defaults to `http://localhost:5000/api/v1`. To override it, copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.

## V1 pages

- Public property search and property detail
- Login and customer/owner registration
- Customer bookings, favorites, notifications, profile
- Owner property creation, image upload, approval submission, archive/delete requests, booking inbox
- Admin property approval queue and lifecycle request review

No V2/V3 features are included.

## Build

```bash
npm run build
npm run preview
```
