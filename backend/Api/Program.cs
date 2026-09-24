using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Api.Filters;
using Api.Middleware;
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
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.SecretKey)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();

// CORS: строгий whitelist origin фронтенда, не AllowAnyOrigin
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Rate limiting: строгий лимит на auth-эндпоинтах, общий лимит на весь API
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Login/logout: a real user mistyping a password a few times shouldn't get locked out.
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Registration: its own budget, separate from login, to keep bulk fake-account
    // creation in check without also throttling people just trying to log in.
    options.AddPolicy("auth-register", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Silent refresh fires on every full page load (not just explicit user action) and is
    // already protected by the httpOnly refresh-token cookie plus rotation, so it needs a
    // much looser budget than login — otherwise a handful of reloads/tabs locks users out.
    options.AddPolicy("auth-refresh", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Order creation: generous enough for a real shopper (retrying after a stock/promo
    // error, ordering more than once), tight enough to blunt scripted order-flooding.
    options.AddPolicy("order-create", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Review creation: one person leaves very few reviews per minute in practice.
    options.AddPolicy("review-create", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Promo code validation: unauthenticated and cheap to call, so it's the easiest
    // endpoint to abuse for brute-forcing promo codes - keep it tighter than the
    // global default.
    options.AddPolicy("promo-validate", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 15,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 100,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

builder.Services.AddHsts(options =>
{
    options.MaxAge = TimeSpan.FromDays(365);
    options.IncludeSubDomains = true;
});

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();

// Apply pending EF Core migrations and seed initial data on every startup, in every
// environment - this used to run only inside the IsDevelopment() branch below, which is
// why a fresh Production database (e.g. Railway Postgres) never got its schema created
// ("relation Products does not exist"). SeedData.SeedAsync is idempotent: it calls
// Database.MigrateAsync (a no-op once migrations are applied) and each seed step is
// separately guarded by an Any() check, so re-running this on every restart is safe and
// won't duplicate the admin user, categories/products, or reviews. Wrapped in try/catch so
// a migration failure logs instead of crashing a pod that might already have a working
// schema from a previous deploy.
try
{
    using var migrationScope = app.Services.CreateScope();
    var db = migrationScope.ServiceProvider.GetRequiredService<AppDbContext>();
    var passwordHasher = migrationScope.ServiceProvider.GetRequiredService<Application.Interfaces.IPasswordHasher>();
    await SeedData.SeedAsync(db, passwordHasher, app.Configuration, app.Logger);
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Database migration/seed failed on startup");
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

app.UseCors("Frontend");

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
});

app.Run();
