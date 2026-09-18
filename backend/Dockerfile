# Railway Root Directory is set to /backend, so the build context here is this
# backend/ folder itself - COPY . . reproduces the Api/Application/Domain/
# Infrastructure sibling layout under /src, which is what the ProjectReference
# entries in each .csproj (relative paths like ..\Domain\Domain.csproj) expect.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore Api/Api.csproj
RUN dotnet publish Api/Api.csproj -c Release -o /app/out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/out .

# Railway injects PORT at container runtime, not at image build time - a plain
# `ENV ASPNETCORE_URLS=http://+:$PORT` line only expands against build-time
# ARG/ENV values (there is none named PORT here), so it would bake the literal
# string "$PORT" into the image instead of the real port. Resolving it in the
# entrypoint's shell at container start reads the actual runtime value; the
# :-8080 fallback keeps `docker run` usable locally where PORT isn't set.
EXPOSE 8080
ENTRYPOINT ["/bin/sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-8080} exec dotnet Api.dll"]
