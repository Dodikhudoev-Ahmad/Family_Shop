using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Api.Common;
using Api.Filters;
using Api.Middleware;
using Api.RateLimiting;
using Api.Security;
using Application;
using Infrastructure;
using Infrastructure.Persistence;
using Infrastructure.Security;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers(options =>
{
    options.Filters.Add<ValidationFilter>();
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "Family Shop API", Version = "v1" });

    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath))
    {
        options.IncludeXmlComments(xmlPath);
    }

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Введите access-токен: Bearer {token}"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddScoped<CookieCsrfFilter>();
// Crawler pages and sitemap: canonical origin and cache time from Seo:* (validated here, a bad value stops the start-up).
builder.Services.AddSingleton(Api.Seo.SeoSettingsFactory.Resolve(builder.Configuration));
builder.Services.AddMemoryCache();
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

// Persist DataProtection keys in Postgres (the same durable store everything else uses)
// instead of the default ephemeral container filesystem - otherwise the key ring is
// regenerated on every restart/redeploy and anything encrypted with it becomes unreadable,
// and a multi-instance deploy would have each instance holding a different key ring.
builder.Services.AddDataProtection()
    .PersistKeysToDbContext<AppDbContext>()
    .SetApplicationName("FamilyShop");

// Keep the multipart/form parser's cap in sync with AdminProductsController's
// MaxImageSizeBytes — the controller's [RequestSizeLimit] already caps the Kestrel request
// body for that endpoint, but without this the form parser would still buffer up to its
// 128MB default before the controller gets a chance to reject an oversized file.
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 5 * 1024 * 1024;
});

// Authentication / Authorization (JWT, roles via claims)
var jwtSettings = builder.Configuration.GetSection("Jwt").Get<JwtSettings>() ?? new JwtSettings();
JwtSettingsValidator.Validate(jwtSettings, builder.Environment.IsDevelopment());

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            RequireSignedTokens = true,
            ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 },
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.SecretKey)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
        options.Events = new JwtBearerEvents
        {
            // A deleted account's still-valid access token is refused at once (see ActiveAccountTokenValidator).
            OnTokenValidated = Api.Security.ActiveAccountTokenValidator.ValidateAsync
        };
    });

// Closed by default: an endpoint that carries neither [Authorize] nor [AllowAnonymous] requires a
// signed-in user, so a new controller or action that forgets its attribute fails closed instead
// of being silently public. Public endpoints say so explicitly with [AllowAnonymous].
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// CORS: строгий whitelist origin фронтенда из конфига (Cors:AllowedOrigins / Cors:AllowedOriginsList), не AllowAnyOrigin
builder.Services.AddFamilyShopCors(builder.Configuration);

// Refresh-token cookie attributes (domain / SameSite) depend on the environment and on the host the API is reached on.
builder.Services.AddSingleton<RefreshCookiePolicy>();

// Rate limiting: строгие лимиты на вход/регистрацию/refresh, общий лимит на весь API (см. Api/RateLimiting)
builder.Services.AddFamilyShopRateLimiting();

// Hourly removal of expired Idempotency-Key records (order creation keeps them 24 h).
builder.Services.AddHostedService<Api.Background.IdempotencyKeyCleanupService>();

builder.Services.AddHsts(options =>
{
    options.MaxAge = TimeSpan.FromDays(365);
    options.IncludeSubDomains = true;
});

// Behind Railway's proxy: real client IP and scheme from X-Forwarded-* (see ForwardedHeadersSetup for the trust decision).
builder.Services.AddFamilyShopForwardedHeaders(builder.Configuration);

var app = builder.Build();

// Must stay the very first middleware: everything after it (HTTPS redirect, rate limiting, auth, logs) sees the real client IP and scheme.
app.UseForwardedHeaders();

// Behind Cloudflare the forwarded address is a Cloudflare node; take the visitor's own from the header Cloudflare adds, but only for requests that really came from Cloudflare.
app.UseCloudflareClientIp(builder.Configuration);

app.UseMiddleware<ExceptionHandlingMiddleware>();

// Apply pending EF Core migrations and seed initial data on every startup, in every
// environment - this used to run only inside the IsDevelopment() branch below, which is
// why a fresh Production database (e.g. Railway Postgres) never got its schema created
// ("relation Products does not exist"). SeedData.SeedAsync is idempotent: it calls
// Database.MigrateAsync (a no-op once migrations are applied) and each seed step is
// separately guarded by an Any() check, so re-running this on every restart is safe and
// won't duplicate the admin user, categories/products, or reviews. Wrapped in try/catch so
// a migration failure logs instead of crashing a pod that might already have a working
// schema from a previous deploy. This is deliberately NOT fail-closed (a temporary rollback
// decided by the owner): a failed migration/seed does not stop the start-up, the API keeps
// serving, and /health below only checks that the database is reachable - it cannot tell a
// half-migrated schema from a healthy one, so such a failure is visible in the log only.
try
{
    using var migrationScope = app.Services.CreateScope();
    var db = migrationScope.ServiceProvider.GetRequiredService<AppDbContext>();
    var passwordHasher = migrationScope.ServiceProvider.GetRequiredService<Application.Interfaces.IPasswordHasher>();
    await SeedData.SeedAsync(db, passwordHasher, app.Configuration, app.Logger, app.Environment.IsDevelopment());
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Database migration/seed failed on startup");
}

// Uploaded-image URLs saved before the move to the shop's own domain still carry the old host: move them to the
// configured public base URL (UPDATE in place, idempotent, only our own upload shape). Skipped when not configured.
try
{
    var publicBaseUrl = Infrastructure.Storage.UploadsLocation.ResolvePublicBaseUrl(app.Configuration);
    if (publicBaseUrl is not null)
    {
        using var urlScope = app.Services.CreateScope();
        await Infrastructure.Persistence.UploadUrlNormalizer.NormalizeAsync(
            urlScope.ServiceProvider.GetRequiredService<AppDbContext>(), publicBaseUrl, app.Logger);
    }
}
catch (InvalidOperationException)
{
    throw; // a malformed Uploads:PublicBaseUrl is a configuration error: fail the start-up
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Normalizing uploaded image URLs failed on startup");
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/swagger/v1/swagger.json", "Family Shop API v1"));
}
else
{
    app.UseHsts();
}

app.UseHttpsRedirection();

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    await next();
});

app.UseFamilyShopCors();

// Uploaded photos are served from the configured uploads directory (Uploads:Path; a mounted volume in production),
// under the same /uploads/* URLs as always. Requests that miss fall through to wwwroot as before.
var uploadsDirectory = app.Services.GetRequiredService<Infrastructure.Storage.UploadsDirectory>();
app.UseUploads(uploadsDirectory.Path);
app.UseStaticFiles();

app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Minimal liveness/readiness probe for the hosting platform (Render/Railway) to detect a dead
// container and restart it — no dedicated health-check package needed for a single DB check.
app.MapGet("/health", async (AppDbContext db, CancellationToken cancellationToken) =>
{
    var canConnect = await db.Database.CanConnectAsync(cancellationToken);
    return canConnect
        ? Results.Ok(new { status = "healthy" })
        : Results.Json(new { status = "unhealthy" }, statusCode: StatusCodes.Status503ServiceUnavailable);
}).AllowAnonymous();

app.Run();
