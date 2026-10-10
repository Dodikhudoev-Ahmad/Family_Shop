using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Application.Interfaces;
using Domain.Interfaces;
using Infrastructure.Persistence;
using Infrastructure.Persistence.Repositories;
using Infrastructure.Security;
using Infrastructure.Storage;

namespace Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection")));

        services.Configure<JwtSettings>(configuration.GetSection("Jwt"));

        // The shop's calendar (today / this week / this month) is the shop's time zone, not UTC.
        services.AddSingleton(Application.Common.StoreClock.FromId(configuration["Store:TimeZone"]));

        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IReviewRepository, ReviewRepository>();
        services.AddScoped<IPromoCodeRepository, PromoCodeRepository>();
        services.AddScoped<IPromoBannerRepository, PromoBannerRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddSingleton<IFinanceReportWriter, Export.FinanceExcelWriter>();

        services.AddScoped<IPasswordHasher, BCryptPasswordHasher>();
        services.AddScoped<IJwtTokenGenerator, JwtTokenGenerator>();

        // Optional online check of new passwords against known breaches (k-anonymity: five hash characters leave the server).
        // Off unless Auth:BreachCheck is true; one long-lived HttpClient with a short timeout, and it fails open.
        if (configuration.GetValue<bool>("Auth:BreachCheck"))
        {
            var breachHttp = new HttpClient { Timeout = HibpBreachedPasswordChecker.Timeout + TimeSpan.FromSeconds(1) };
            services.AddSingleton<IBreachedPasswordChecker>(sp => new HibpBreachedPasswordChecker(
                breachHttp,
                sp.GetRequiredService<Microsoft.Extensions.Logging.ILoggerFactory>().CreateLogger(nameof(HibpBreachedPasswordChecker)),
                configuration["Auth:BreachCheckUrl"]));
        }
        else
        {
            services.AddSingleton<IBreachedPasswordChecker, NoBreachedPasswordCheck>();
        }
        services.AddSingleton(sp => new UploadsDirectory(
            UploadsLocation.Resolve(configuration, sp.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>().ContentRootPath)));
        services.AddScoped<IImageStorageService>(sp => new LocalImageStorageService(sp.GetRequiredService<UploadsDirectory>().Path));

        return services;
    }
}
