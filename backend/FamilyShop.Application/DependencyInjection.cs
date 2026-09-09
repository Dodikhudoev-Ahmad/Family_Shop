using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using FamilyShop.Application.Interfaces;
using FamilyShop.Application.Services;
using FamilyShop.Application.Validators;

namespace FamilyShop.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IProductService, ProductService>();
        services.AddScoped<ICategoryService, CategoryService>();
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<IAuthService, AuthService>();

        services.AddValidatorsFromAssemblyContaining<RegisterRequestValidator>();

        return services;
    }
}
