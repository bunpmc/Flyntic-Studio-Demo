# =========================
# BUILD STAGE
# =========================
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy toàn bộ source
COPY . .

# Restore riêng project Web để nhẹ RAM hơn
RUN dotnet restore FlynticStudio.Web/FlynticStudio.Web.csproj

# Publish tối ưu memory
RUN dotnet publish FlynticStudio.Web/FlynticStudio.Web.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false \
    /p:PublishTrimmed=false

# =========================
# RUNTIME STAGE
# =========================
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app

COPY --from=build /app/publish .

# Render inject biến PORT
ENV ASPNETCORE_URLS=http://+:$PORT

ENTRYPOINT ["dotnet", "FlynticStudio.Web.dll"]
