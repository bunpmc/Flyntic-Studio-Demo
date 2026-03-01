# ===== BUILD STAGE =====
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY FlynticStudio.sln .
COPY FlynticStudio.Web/FlynticStudio.Web.csproj FlynticStudio.Web/
COPY FlynticStudio.Services/FlynticStudio.Services.csproj FlynticStudio.Services/
COPY FlynticStudio.Data/FlynticStudio.Data.csproj FlynticStudio.Data/

RUN dotnet restore

COPY . .

WORKDIR /src/FlynticStudio.Web
RUN dotnet publish -c Release -o /app/publish

# ===== RUNTIME STAGE =====
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:$PORT

EXPOSE 10000

ENTRYPOINT ["dotnet", "FlynticStudio.Web.dll"]
