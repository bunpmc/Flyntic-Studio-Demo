# ===== BUILD STAGE =====
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution và project files trước để tận dụng cache
COPY FlynticStudio.sln .
COPY FlynticStudio.Web/FlynticStudio.Web.csproj FlynticStudio.Web/
COPY FlynticStudio.Services/FlynticStudio.Services.csproj FlynticStudio.Services/
COPY FlynticStudio.Data/FlynticStudio.Data.csproj FlynticStudio.Data/

# Restore
RUN dotnet restore

# Copy toàn bộ source
COPY . .

# Publish
WORKDIR /src/FlynticStudio.Web
RUN dotnet publish -c Release -o /app/publish

# ===== RUNTIME STAGE =====
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

COPY --from=build /app/publish .

# Render yêu cầu dùng biến PORT
ENV ASPNETCORE_URLS=http://+:$PORT

EXPOSE 10000

ENTRYPOINT ["dotnet", "FlynticStudio.Web.dll"]
