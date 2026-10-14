# 🏢 SMR Groups Billing System

<p align="center">
  <strong>An advanced, multi-tenant billing and inventory management solution engineered for SMR Trading and Company.</strong>
</p>

---

## 📖 Overview

The **SMR Groups Billing System** is an enterprise-grade, high-performance web application designed to streamline point-of-sale, inventory tracking, quotation generation, and comprehensive financial reporting. 

Engineered with a robust multi-tenant architecture and a highly polished "classic" reporting user interface, the system seamlessly interfaces with both local databases for ultra-low latency and cloud-native environments for secure remote backups.

## ✨ Key Features

- **🛡️ Secure Multi-Tenant Architecture**: Operates on a highly scalable multi-database model using SQLite. Each tenant (client/business entity) maintains full data isolation via dedicated `billing_tenant_<hash>.sqlite` vaults.
- **☁️ Cloud Synchronization Engine**: Features a proprietary real-time backup mechanism that securely replicates on-premise SQLite databases into isolated schemas on a highly-available **Neon PostgreSQL** cluster.
- **📊 Professional Reporting & Quotations**: 
  - Dynamic generation of Purchase Statements, Sales Statements, and GST Reports.
  - Pixel-perfect, coordinate-aligned Print Layouts engineered specifically for SMR Trading and Company's pre-printed physical stationery.
- **📦 Comprehensive Inventory & WEG Stock**: Advanced item master configuration, automated low-stock thresholds, and precise tracking of WEG Electric Motors (HP, RPM, Poles, Phase, Frame).
- **💼 End-to-End Accounting**: Full lifecycle management of Customers, Suppliers, Sales Executives, Company Staff, and Daily Expenses.
- **📥 Customer & Supplier Imports**: Preview and validate up to 100 records per batch from `.xlsx`, `.csv`, `.tsv`, `.txt`, `.json`, or text-based `.pdf` files. Scanned PDFs require OCR/conversion before import.
- **🏢 Company Login Panels**: The sign-in page lists active company panels using only public company names and panel logos. Administrators can upload or remove each panel logo from the licensee manager. Customer, supplier, and product selectors support typing to search saved records.
- **🎨 Glassmorphism & Premium UI**: Features a sleek, modern, and highly responsive user interface combining professional basic styling with fluid micro-animations.

---

## 🛠️ Technology Stack

### Frontend Architecture
- **Framework**: React 18 / Vite
- **Language**: TypeScript
- **Styling**: Vanilla CSS (Custom Design System featuring Glassmorphism and classic red-bordered print utilities)
- **Routing**: React Router DOM
- **Icons**: Lucide React

### Backend Architecture
- **Framework**: Node.js / Express.js
- **Language**: TypeScript
- **Primary Datastore**: SQLite3 (Multi-tenant file separation)
- **Cloud Backup Datastore**: Neon Database (Serverless PostgreSQL)
- **Authentication**: Custom scrypt-based password hashing and tokenized sessions

---

## Downloads and Project Links

- **Windows desktop installer and release history:** [Releases](https://github.com/puspharajm/ps-billing/releases)
- **GitHub Packages:** [Packages](https://github.com/users/puspharajm/packages?repo_name=ps-billing)
- **Latest installer:** [Download the Windows installer](https://github.com/puspharajm/ps-billing/releases/latest)

## Desktop App and Data

Download and run the Windows installer from the latest release. On first launch, create an administrator username and a unique password of at least 12 characters. The desktop app initializes its SQLite database automatically in `%APPDATA%\SMR Groups Billing`; customer, invoice, inventory, and account data are stored in that Windows user profile. The installer contains no developer or customer database.

After signing in as administrator, create company-user accounts and assign each to its licensee from the admin panel. Company panels appear on the sign-in screen once their user accounts have been configured. Keep regular backups of the user-data folder.

For server deployments, configure `DATABASE_URL` or `NEON_DATABASE_URL` as appropriate. Set both `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` to create or reset the administrator during database initialization. The optional `DEFAULT_USER_PASSWORD` seeds missing default company-user accounts; it never resets existing user passwords. Store deployment credentials in the hosting provider's secret environment configuration, never in source control.

## Building the Windows Installer

The Windows GitHub Actions workflow builds the frontend and backend, rebuilds SQLite for Electron, and publishes the installer to [Releases](https://github.com/puspharajm/ps-billing/releases). Local developers can build the same installer on Windows with Node.js 18 or newer by installing the root, frontend, and backend dependencies and running `npm run electron:dist`. The installer contains application code, not the developer's local database.

---

## 🔒 Security Posture

- **No Hardcoded Secrets**: Database connection strings and account-bootstrap credentials are supplied through environment variables; account passwords are stored as salted scrypt hashes.
- **Path Traversal Mitigation**: Implements strict `path.normalize` and boundaries validation when accessing tenant-specific file clusters.
- **Object Injection Defenses**: Safely utilizes strict prototype-agnostic checks during database synchronization loops.
- **Party Import Safety**: Import files are parsed locally and are not uploaded. Reviewed, validated records are sent through the authenticated API and stored in the active tenant database (hosted PostgreSQL when configured, otherwise local SQLite); existing names are skipped. Excel archives, file sizes, and batch sizes are bounded.

---

## 🤝 Contribution Guidelines
This is a proprietary application built for SMR Groups. Authorized developers can contribute by submitting feature requests or pull requests to the `main` branch. 

*Engineered with precision for professional billing and inventory operations.*
