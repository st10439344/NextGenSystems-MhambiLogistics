# Mhambi Logistics Enterprise Logistics Management Platform

**Developed by NextGen Systems**

**Project:** Work Integrated Learning 3B — Enterprise Logistics Management Platform  
**Institution:** IIE Rosebank College  
**Project Team:** Sindisiwe Ntuli and Thandiswa Gama  
**Project Status:** Academic prototype — active development and testing

---

## 1. Project Overview

The **Mhambi Logistics Enterprise Logistics Management Platform** is an integrated logistics management solution designed to support the operational needs of a logistics and transportation business.

Developed by **NextGen Systems**, the platform combines an Android mobile application, a RESTful backend API, a PostgreSQL database and a web-based interface.

The system aims to improve shipment coordination, inventory management, fleet operations, procurement, financial administration and communication between clients and internal departments.

## 2. Project Objectives

The primary objectives are to:

- Centralise logistics information and departmental operations.
- Improve shipment creation, assignment and tracking.
- Support warehouse stock monitoring and inventory movements.
- Improve fleet and driver coordination.
- Facilitate procurement and supplier management.
- Support financial and administrative workflows.
- Provide role-based access to appropriate system functionality.
- Improve operational visibility through dashboards and reports.

## 3. Technology Stack

| Component | Technology |
|---|---|
| Android application | Kotlin, Jetpack Compose |
| Android development | Android Studio |
| Backend API | Node.js, Express.js |
| Database | PostgreSQL |
| Cloud database hosting | Neon |
| Website | HTML5, CSS3, JavaScript |
| Authentication | JWT-based authentication and Google Sign-In integration |
| Backend testing | Jest, Supertest |
| Android testing | Gradle unit tests |
| Version control | Git, GitHub |
| Continuous integration | GitHub Actions |
| Android testing environment | BlueStacks 5 |

## 4. System Architecture

The platform consists of four main components.

### Android Application

The Android application provides mobile access to role-specific dashboards and logistics functions.

It is developed using Kotlin and Jetpack Compose.

### REST API

The Node.js and Express backend processes requests from application clients, implements business logic and provides access to logistics data.

### PostgreSQL Database

PostgreSQL stores the platform's structured information, including users, companies, shipments, inventory and other operational records.

The development project uses a PostgreSQL database hosted on Neon.

### Website

The website provides a public-facing interface and web-based logistics portal functionality.

The website and Android application form part of the broader Mhambi Logistics solution. Their integration and individual features should be evaluated separately.

## 5. User Roles

The system is designed around eight user roles.

| Role | Primary Responsibilities |
|---|---|
| Administrator | User management, role management, company management, system settings and audit logs |
| Dispatcher | Shipment creation, driver assignment, route planning and delivery scheduling |
| Warehouse | Inventory management, stock receiving, stock dispatch and low-stock monitoring |
| Fleet | Vehicle management, maintenance, fuel management and vehicle assignments |
| Procurement | Supplier management, purchase requests, purchase orders and goods received |
| Finance | Invoices, payments, receipts, expenses and financial reports |
| Driver | Assigned deliveries, delivery schedules, navigation, proof of delivery and incident reporting |
| Client | Quotation requests, shipment tracking, shipment history, documents and support |

## 6. Key Features

The project includes the following areas of functionality:

- User registration and authentication.
- Role-based dashboards and navigation.
- Google Sign-In integration.
- Shipment and delivery management.
- Warehouse inventory operations.
- Fleet and vehicle management.
- Procurement and supplier workflows.
- Finance and reporting interfaces.
- Client quotation and tracking functions.
- User profile and settings management.

Some features remain prototype-level and may use demonstration data.

## 7. Repository Structure

```text
NextGenSystems-MhambiLogistics/
├── .github/
│   └── workflows/
│       ├── android-ci.yml
│       └── backend-ci.yml
├── android/
│   └── Android application source and Gradle configuration
├── backend/
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── package-lock.json
├── NextGenSystem-Complete/
│   └── Website and web portal project files
├── shared/
│   └── portal-config.json
├── .gitignore
└── README.md
```

## 8. Backend Setup

### Prerequisites

- Node.js version 20 or newer.
- npm.
- Access to a PostgreSQL database.
- A correctly configured backend environment file.

### Installation

Clone the repository:

```bash
git clone https://github.com/st10439344/NextGenSystems-MhambiLogistics.git
```

Navigate to the backend:

```bash
cd NextGenSystems-MhambiLogistics/backend
```

Install dependencies:

```bash
npm ci
```

Create a local `.env` file using the provided `.env.example` as a guide.

Configure the required environment variables using your own development credentials.

**Never commit `.env`, passwords, database connection strings or private API credentials to GitHub.**

Run database migrations:

```bash
node --env-file=.env src/db/migrate.js
```

Start the backend:

```bash
node --env-file=.env src/server.js
```

The local API uses port `3000` unless configured otherwise.

The health endpoint is:

```text
http://localhost:3000/api/v1/health
```

### Important Database Warning

The backend test setup drops and recreates the `public` schema.

Never run the Jest test suite against the production database or the main Neon development database.

Always use a separate, disposable PostgreSQL database specifically created for testing.

## 9. Android Application Setup

### Prerequisites

- Android Studio.
- Android SDK.
- Java 17 for the Gradle build.
- BlueStacks 5 or another compatible Android testing device.
- A running backend API for network-dependent functionality.

### Running the Application

1. Open Android Studio.
2. Select **Open**.
3. Open the repository's `android` folder.
4. Allow Gradle synchronization to complete.
5. Start BlueStacks 5 and enable Android debugging.
6. Connect BlueStacks through ADB if required.
7. Select the connected Android device.
8. Build and run the application.

The Android application must be configured to use a backend address reachable from the selected device.

**Note:** BlueStacks was approved by the project lecturer as the Android testing environment for this academic project.

## 10. Automated Testing and Continuous Integration

GitHub Actions is used to automate testing and build verification.

### Android CI

Workflow:

```text
.github/workflows/android-ci.yml
```

The workflow:

- Configures Java 17.
- Executes Android unit tests.
- Builds a debug APK.
- Uploads the APK as a GitHub Actions artifact.

**Latest verified status during README preparation:** Passed.

### Backend CI

Workflow:

```text
.github/workflows/backend-ci.yml
```

The workflow:

- Configures Node.js.
- Starts an isolated PostgreSQL testing service.
- Installs backend dependencies.
- Executes Jest tests.

**Status during README preparation:** Troubleshooting outstanding test-suite failures.

The backend test workflow uses a disposable database and does not require access to the main Neon database.

### GitHub Actions

View the latest workflow results:

https://github.com/st10439344/NextGenSystems-MhambiLogistics/actions

## 11. Testing Evidence

The project uses automated tests and manual functional testing.

Areas covered include:

- Authentication and registration.
- Role-based access control.
- API functionality.
- Database operations.
- Inventory and operational workflows.
- Android build verification.
- Navigation and role-specific screens.

The team also performs manual Android application testing using BlueStacks.

Passing automated tests should not be interpreted as proof that every production scenario has been tested.

## 12. Security Considerations

The system incorporates or is designed to support:

- Authentication and access control.
- Role-based permissions.
- Protected backend endpoints.
- Input validation.
- Environment-based configuration.
- Password hashing.
- Database access restrictions.
- Audit logging.

Production deployment would require further security review, vulnerability remediation, secure secret management and operational monitoring.

## 13. Current Development Status

### Implemented and Demonstrated

- Android application with eight role-based interfaces.
- User registration and login workflows.
- Google Sign-In functionality.
- REST API backend.
- PostgreSQL database integration.
- Development database migrations and demonstration data.
- GitHub source-code repository.
- Android automated testing and APK build workflow.

### Ongoing Work

- Resolution of remaining backend CI test-suite failures.
- Final documentation and testing evidence.
- Verification of all project requirements against the assessment rubric.
- Final demonstration and submission preparation.

## 14. Project Team

**NextGen Systems**

| Team Member | Project Role |
|---|---|
| Sindisiwe Ntuli | Team Leader |
| Thandiswa Gama | System Developer |

**Academic Supervisor/Lecturer:** Mr Zenzele Vilakazi.

## 15. Academic Disclaimer

This repository contains an academic prototype developed for the Work Integrated Learning module at IIE Rosebank College.

The project is intended to demonstrate software development, system integration, database design, role-based functionality, testing and teamwork.

The platform is not represented as a production-certified logistics system.

---

© 2026 NextGen Systems. Mhambi Logistics Enterprise Logistics Management Platform. Academic project.
