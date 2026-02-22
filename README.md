# OmniEHR
<img width="1470" height="833" alt="Screenshot 2026-02-22 at 3 21 17 PM" src="https://github.com/user-attachments/assets/f5d0c87d-2d05-49e6-bb59-29a11e5a3690" />

Electronic Health Record application with FHIR R4-shaped APIs and HIPAA-aligned controls.

Access here:
https://omni-ehr.vercel.app

Admin login credentials:
email - admin@omnihealth.com
password - Abcdefgh@998761

Practitioner login credentials:
email - drsonal@omnihealth.com
password - Abcdefgh@998761

## Compliance note

This repository implements major technical safeguards (access control, audit trail, encryption, validation), but HIPAA compliance is not code-only. Real compliance still requires BAAs, policy/process controls, risk assessment, incident response, training, and secure infrastructure operations.

## Stack

- Backend: Node.js, Express, MongoDB (Mongoose), JWT auth
- Frontend: React + Vite
- Standards: FHIR R4 resource patterns (`Patient`, `Observation`, `Condition`, `AllergyIntolerance`, `MedicationRequest`, `Encounter`, `Appointment`)
- Security controls: RBAC, bcrypt, AES-256-GCM field encryption for PHI, audit logs, rate limiting, input validation

## Major EHR features

- User authentication and role-based access (`admin`, `practitioner`, `auditor`)
- Admin-only user provisioning
- Patient registry with encrypted demographics (at-rest encryption for PHI fields)
- Patient self-registration portal (`/patient-register`) with automatic 7-digit PID assignment
- Automatic 7-digit PID assignment for every new patient (portal + admin-created)
- Longitudinal chart view (`Patient/$everything`) including:
  - Problem list (`Condition`)
  - Allergies (`AllergyIntolerance`)
  - Medications (`MedicationRequest`)
  - Encounters (`Encounter`)
  - Clinical observations/vitals (`Observation`)
  - Scheduling (`Appointment`)
- Global scheduler page with date filtering and appointment creation
  - Admins can book across all active practitioners
  - Practitioners can only book their own schedule
  - Fixed booking windows: Monday-Saturday, 09:00 AM-12:00 PM, 15-minute slots
  - Unavailable slots are disabled in slot dropdowns
  - Overlap conflicts block booking for unavailable practitioners
- Audit log review for admin/auditor roles

## FHIR API endpoints

Base: `/api/fhir`

- `GET /metadata`

Patient:
- `POST /Patient`
- `GET /Patient`
- `GET /Patient/:id`
- `PUT /Patient/:id`
- `GET /Patient/:id/$everything`

Observation:
- `POST /Observation`
- `GET /Observation`
- `GET /Observation/:id`
- `PUT /Observation/:id`

Condition:
- `POST /Condition`
- `GET /Condition`
- `GET /Condition/:id`
- `PUT /Condition/:id`

AllergyIntolerance:
- `POST /AllergyIntolerance`
- `GET /AllergyIntolerance`
- `GET /AllergyIntolerance/:id`
- `PUT /AllergyIntolerance/:id`

MedicationRequest:
- `POST /MedicationRequest`
- `GET /MedicationRequest`
- `GET /MedicationRequest/:id`
- `PUT /MedicationRequest/:id`

Encounter:
- `POST /Encounter`
- `GET /Encounter`
- `GET /Encounter/:id`
- `PUT /Encounter/:id`

Appointment:
- `POST /Appointment`
- `GET /Appointment`
- `GET /Appointment/:id`
- `PUT /Appointment/:id`

Admin:
- `GET /api/admin/practitioners`

Public:
- `POST /api/public/patient-register`

## HIPAA-aligned controls in code

- Authentication + authorization:
  - JWT bearer tokens
  - RBAC middleware by role
- Access provisioning:
  - Admin endpoint for creating users (including additional admins)
  - Patient creation through FHIR is admin-only
- Encryption:
  - AES-256-GCM for patient PHI fields (name/contact/address)
- Audit controls:
  - Automatic audit events for `/api/fhir/*` and `/api/admin/*`
  - Audit review endpoint with pagination/filter hooks
- Security hardening:
  - `helmet`, CORS control, auth rate limiting, strict Zod validation

## Local setup

### 1) Start MongoDB

```bash
docker compose up -d
```

Or point `MONGODB_URI` to an existing Mongo instance.

### 2) Install dependencies

```bash
npm install
```

### 3) Configure env

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Generate and set `PHI_ENCRYPTION_KEY` (64 hex chars):

```bash
openssl rand -hex 32
```

### 4) Run

```bash
npm run dev
```

- API: `http://localhost:4000`
- UI: `http://localhost:5173`

## Quality checks

```bash
npm run lint
npm run build --workspace client
```

## Real-world hardening still recommended

- Enforce TLS everywhere and use secure secret management/HSM/KMS
- Add MFA, token revocation, and refresh token rotation
- Implement consent directives and break-glass access workflow
- Integrate immutable audit sink/SIEM monitoring
- Add formal test suite (unit, integration, API conformance) and security scanning
