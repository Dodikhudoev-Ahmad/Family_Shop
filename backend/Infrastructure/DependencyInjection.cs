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
        services.AddSingleton(sp => new UploadsDirectory(
            UploadsLocation.Resolve(configuration, sp.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>().ContentRootPath)));
        services.AddScoped<IImageStorageService>(sp => new LocalImageStorageService(sp.GetRequiredService<UploadsDirectory>().Path));

        return services;
    }
}
