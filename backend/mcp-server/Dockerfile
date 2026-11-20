FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY src/Clovrix.McpServer/Clovrix.McpServer.csproj ./Clovrix.McpServer/
RUN dotnet restore ./Clovrix.McpServer/Clovrix.McpServer.csproj

COPY src/Clovrix.McpServer/ ./Clovrix.McpServer/
WORKDIR /src/Clovrix.McpServer
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
RUN useradd -m -u 1001 clovrix && chown -R clovrix:clovrix /app
USER clovrix
EXPOSE 8080
ENTRYPOINT ["dotnet", "Clovrix.McpServer.dll"]
