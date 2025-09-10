# MyHealthApp

⚠️ **SECURITY WARNING: DO NOT DEPLOY TO PRODUCTION** ⚠️

This application contains **CRITICAL SECURITY VULNERABILITIES** that must be addressed before any deployment.

## 🔴 Critical Security Issues Identified

- **SQL Injection** - Database can be compromised
- **Authorization Bypass** - Users can access/modify other users' data  
- **XSS Vulnerabilities** - Script injection possible
- **Insecure Session Management** - Session hijacking possible
- **Information Disclosure** - Sensitive data logged

See `SECURITY_REVIEW.md` for complete details and `SECURITY_FIXES.md` for remediation.

## Features
- **Login**: User authentication (⚠️ VULNERABLE)
- **Registration**: User account creation (⚠️ VULNERABLE)
- **Health Data Management**: Manage and track health metrics (⚠️ VULNERABLE)

## Security Testing

🔒 **Run security tests to verify vulnerabilities:**
```sh
npm run test:security
```

## Installation
To set up the project locally, follow these steps:
1. Clone the repository:
   ```sh
   git clone https://github.com/ipso-oop/MyHealthApp.git
   ```
2. Navigate to the project directory:
   ```sh
   cd MyHealthApp
   ```
3. Install the dependencies:
   ```sh
   npm install
   ```

## Usage
To start the application, run:
```sh
npm start
```
Open your browser and go to `http://localhost:3000` to use the application.

## Continuous Integration and Deployment
This project uses GitHub Actions for continuous integration and deployment.

### GitHub Actions Workflows
You can access the GitHub Actions workflows for this repository [here](https://github.com/ipso-oop/MyHealthApp/actions).

## Contribution Guidelines
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/YourFeature`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/YourFeature`).
5. Open a pull request.

## License
This project is licensed under the MIT License.

For more details, visit the [repository](https://github.com/ipso-oop/MyHealthApp).

Feel free to update or add any additional information as needed.
