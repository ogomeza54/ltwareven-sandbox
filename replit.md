# Overview

This is a full-stack trucking business management system (HaulMaster Pro) built with React, Express, and PostgreSQL. The application provides comprehensive tools for managing job intake, work orders, fleet inventory, drivers/technicians, and client data in a multi-tenant SaaS architecture. The UI follows a professional dark trucking theme with amber/orange primary accents on slate-dark backgrounds.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Framework**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: 
  - TanStack Query for server state management
  - Zustand for client-side state (company context)
  - React Hook Form for form state
- **Routing**: Wouter for lightweight client-side routing
- **File Structure**: Component-based architecture with shared UI components

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL with Neon serverless driver
- **File Uploads**: Multer middleware for handling image uploads
- **API Design**: RESTful API with consistent error handling
- **Authentication**: Session-based authentication (middleware in place)

## Database Design
- **Multi-tenancy**: Company-based data isolation
- **Schema**: Comprehensive relational schema covering:
  - Companies (tenant isolation)
  - Users (authentication and roles)
  - Mechanics (staff management)
  - Customers (client information)
  - Vehicles (customer assets)
  - Repair Orders (work orders)
  - Inventory Parts (stock management)
  - Parts Usage (tracking consumption)

# Key Components

## Frontend Components
- **Layout System**: Sidebar navigation with top bar
- **Form Management**: Comprehensive intake forms with file upload support
- **Data Tables**: Interactive lists for repair orders, inventory, mechanics
- **Modal System**: Detail views and editing interfaces
- **Dashboard**: Analytics and overview widgets

## Backend Services
- **Storage Layer**: Abstracted database operations with TypeScript interfaces
- **Auto-assignment**: Algorithm for mechanic workload distribution
- **File Management**: Image upload handling with validation
- **Multi-tenancy**: Company-scoped data access patterns

## Business Logic
- **Workflow Management**: Status tracking for repair orders
- **Inventory Control**: Stock level monitoring, parts usage tracking, admin-only stock adjustments with full audit trail, and physical count workflow (draft→submitted→approved/rejected with automatic variance adjustments on approval)
- **Super Admin Company Switcher**: Session-level company override for super admins — sidebar company picker + amber fixed banner + `/api/admin/switch-company` endpoint; exits on logout
- **Resource Management**: Mechanic availability and workload balancing
- **Customer Relations**: Vehicle history and repair tracking

# Data Flow

## User Interactions
1. **Intake Process**: Customer information → Vehicle details → Damage documentation → Repair order creation
2. **Work Assignment**: Auto-assignment algorithm or manual mechanic selection
3. **Progress Tracking**: Status updates, time logging, parts consumption
4. **Completion**: Final inspection, customer notification, billing

## Data Synchronization
- Real-time updates through TanStack Query
- Optimistic updates for better user experience
- Automatic cache invalidation on mutations
- File upload progress tracking

# External Dependencies

## Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connectivity
- **@radix-ui/***: Accessible UI component primitives
- **@tanstack/react-query**: Server state management
- **drizzle-orm**: Type-safe database operations
- **zod**: Runtime type validation
- **react-hook-form**: Form state management

## Development Tools
- **drizzle-kit**: Database schema management and migrations
- **tsx**: TypeScript execution for development
- **vite**: Build tool and development server
- **tailwindcss**: Utility-first CSS framework

## File Handling
- **multer**: Multipart form data handling
- **file validation**: Image type and size restrictions (10MB limit)
- **upload directory**: Local file storage in uploads/ directory

# Deployment Strategy

## Build Process
- **Frontend**: Vite builds optimized static assets to dist/public
- **Backend**: esbuild bundles Node.js application to dist/
- **Database**: Drizzle migrations handle schema changes

## Environment Configuration
- **Development**: Hot reloading with Vite dev server
- **Production**: Static file serving through Express
- **Database**: Environment-based connection strings
- **File Storage**: Local uploads directory (can be extended to cloud storage)

## Multi-tenancy Implementation
- Company-scoped data access at the database level
- User authentication provides company context
- All queries filtered by company ID
- Isolated data storage per tenant

## Scalability Considerations
- Serverless database connection pooling
- Component-based frontend architecture for code splitting
- Modular backend services for horizontal scaling
- Prepared for cloud file storage migration