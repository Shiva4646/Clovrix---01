FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/Clovrix.Api/Clovrix.Api.csproj ./Clovrix.Api/
RUN dotnet restore ./Clovrix.Api/Clovrix.Api.csproj
COPY src/Clovrix.Api/ ./Clovrix.Api/
WORKDIR /src/Clovrix.Api
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
RUN mkdir -p /app/logs && useradd -m -u 1001 clovrix && chown -R clovrix:clovrix /app
USER clovrix
EXPOSE 8080
ENTRYPOINT ["dotnet", "Clovrix.Api.dll"]
