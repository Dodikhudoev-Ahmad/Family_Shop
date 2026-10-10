using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Application.Common;
using Application.Interfaces;
using Application.Services;
using Application.Validators;

namespace Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IProductService, ProductService>();
        services.AddScoped<ICategoryService, CategoryService>();
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddSingleton<ILoginAttemptTracker, LoginAttemptTracker>(); // per-account pause after repeated wrong passwords (in memory)
        services.AddScoped<IReviewService, ReviewService>();
        services.AddScoped<IPromoCodeService, PromoCodeService>();
        services.AddScoped<IPromoBannerService, PromoBannerService>();
        services.AddScoped<IFinanceService, FinanceService>();
        services.AddScoped<ISeoService, SeoService>(); // needs a SeoSettings singleton, registered by the host (Seo:* configuration)

        services.AddValidatorsFromAssemblyContaining<RegisterRequestValidator>();

        return services;
    }
}
