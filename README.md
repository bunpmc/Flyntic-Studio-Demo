# Flyntic Studio

Flyntic Studio is a modular web application designed for managing, assembling, and calculating drone configurations. It provides a user-friendly interface for drone enthusiasts and professionals to design, simulate, and optimize drone assemblies.

## Features
- **Drone Assembly Management:** Create, edit, and manage drone assemblies with customizable components.
- **Calculation Services:** Perform calculations related to drone performance, weight, and other parameters.
- **Web Interface:** Intuitive web UI for interacting with drone data and visualizing configurations.
- **Extensible Architecture:** Built with a service-oriented approach for easy extension and integration.

## Project Structure
- `FlynticStudio.Services/`: Backend services for drone assembly and calculation logic.
- `FlynticStudio.Web/`: ASP.NET Core web application with controllers, views, and static assets.

## Getting Started
1. **Clone the repository:**
   ```bash
   git clone https://github.com/Eau-Claire/Flyntic-Studio-Demo.git
   ```
2. **Build the solution:**
   ```bash
   dotnet build FlynticStudio.sln
   ```
3. **Run the web application:**
   ```bash
   dotnet run --project FlynticStudio.Web/FlynticStudio.Web.csproj
   ```
4. **Access the app:**
   Open your browser and navigate to `http://localhost:5000` (or the port specified in your configuration).

## Requirements
- .NET 9.0 SDK or later

## License
MIT License

---

**Short Description:**

Flyntic Studio is a modular ASP.NET Core web application for managing and calculating drone assemblies, offering an extensible platform for drone design and simulation.