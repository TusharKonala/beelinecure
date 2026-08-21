# BeelineCure

A full-stack, white-label clinic management platform built solo as a demonstration of end-to-end SaaS product development — covering scheduling systems, payments, realtime features, background jobs, and AI-assisted workflows.

## Overview

BeelineCure is a white-label clinic management platform built around a **per-clinic, forked-codebase deployment model**: each clinic instance is a separate fork of the codebase, giving it full branding and configuration independence rather than sharing a single multi-tenant backend.

This repo showcases production-style architecture and features across the full stack — booking systems, payments, teleconsultation, AI-powered screening, and more.

## Features

- **Doctor Booking & Scheduling** — Slot generation, window-based availability, overlap detection, and flexible delete/edit modes with automatic refund handling
- **Teleconsultation** — Video consultations powered by Google Meet integration
- **E-Prescriptions** — Digital prescription generation and management
- **Patient Management** — Centralized patient records and history
- **Post-Visit Chat** — Follow-up communication between patients and doctors after a consultation
- **Reviews System** — Patient feedback and ratings for doctors/clinics
- **Careers / ATS Module** — AI-powered candidate screening for clinic hiring needs
- **Admin Panel** — Full administrative control over clinic operations, staff, and configuration

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database / Backend:** Supabase
- **Payments:** Stripe (bookings, subscriptions, refunds)
- **Background Jobs:** Inngest
- **Realtime:** Pusher
- **File Storage:** Cloudflare R2
- **AI Features:** Anthropic API (e.g., ATS resume screening)
- **Email:** Resend
- **Language:** TypeScript

## Architecture

BeelineCure uses a **forked-codebase-per-clinic** approach rather than a single multi-tenant application. Each clinic instance is its own deployment with independent branding and configuration. This design choice favors:

- Full white-label customization per client
- Isolation between clinics (no shared-tenant risk)
- Simpler debugging and per-client iteration

at the cost of horizontal scalability — a deliberate tradeoff suited to a small number of high-touch deployments rather than thousands of tenants.

## Getting Started

### 1. Fork / Clone the repository

```bash
git clone <repo-url>
cd beelinecure
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in the required keys — see [Environment Variables](#environment-variables) below.

### 4. Set up Supabase

- Create a new Supabase project
- Run the SQL migrations in `/supabase` (or your migrations folder) to set up the schema
- Copy your project URL and service role key into `.env.local`

### 5. Configure external services

- **Stripe:** create a test-mode account, add API keys, and set up a webhook endpoint pointing to `/api/webhooks/stripe`
- **Inngest:** connect the project for background job processing (slot expiry, reminders, etc.)
- **Pusher:** create an app for realtime features (chat, notifications)
- **Cloudflare R2:** create a bucket for file storage (prescriptions, documents, images)
- **Google Cloud:** enable OAuth + Calendar/Meet API for doctor signup and teleconsultation links
- **Resend:** add an API key for transactional email
- **Anthropic API:** add a key to enable AI-powered candidate screening in the careers module

### 6. Run the development server

```bash
npm run dev
```

The app should now be running at `http://localhost:3000`.

## Environment Variables

The following services require API keys/configuration in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`
- `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET`
- `CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (for Meet integration & doctor OAuth signup)

## Why This Project

BeelineCure was built solo, end-to-end, to demonstrate:

- Designing and implementing real-world scheduling logic (slot generation, overlap detection, race-condition-safe bookings)
- Integrating multiple third-party services (payments, realtime, storage, background jobs, AI) into a cohesive product
- Making and documenting architectural tradeoffs (white-label forked deployment vs. multi-tenancy)
- Building a complete product surface — patient-facing booking, doctor tools, admin panel, and an AI-assisted hiring module — rather than an isolated feature demo

---
