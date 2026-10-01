using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Xunit;

namespace Application.Tests.Security;

/// <summary>
/// Guards against "added an endpoint and forgot the attribute". The API also has a fallback policy
/// that closes unmarked endpoints, but these tests make the intended exposure explicit and fail
/// loudly when it changes.
/// </summary>
public class EndpointAuthorizationTests
{
    private static readonly Assembly ApiAssembly = typeof(Api.Controllers.AuthController).Assembly;

    private static IEnumerable<Type> Controllers() =>
        ApiAssembly.GetTypes().Where(t => t.IsClass && !t.IsAbstract && typeof(ControllerBase).IsAssignableFrom(t));

    private static IEnumerable<MethodInfo> Actions(Type controller) =>
        controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetCustomAttributes().OfType<HttpMethodAttribute>().Any());

    private static string Route(Type controller) =>
        controller.GetCustomAttribute<RouteAttribute>()?.Template ?? string.Empty;

    [Fact]
    public void EveryAdminController_RequiresTheAdminRole_AtClassLevel()
    {
        var adminControllers = Controllers().Where(c => Route(c).Contains("/admin/", StringComparison.OrdinalIgnoreCase)).ToList();
        Assert.NotEmpty(adminControllers);

        foreach (var controller in adminControllers)
        {
            var authorize = controller.GetCustomAttributes<AuthorizeAttribute>().ToList();
            Assert.True(authorize.Any(a => a.Roles == "Admin"), $"{controller.Name} must be [Authorize(Roles = \"Admin\")]");
            Assert.False(controller.GetCustomAttributes<AllowAnonymousAttribute>().Any(), $"{controller.Name} must not be anonymous");
            foreach (var action in Actions(controller))
            {
                Assert.False(action.GetCustomAttributes<AllowAnonymousAttribute>().Any(), $"{controller.Name}.{action.Name} must not be anonymous");
            }
        }
    }

    [Fact]
    public void AllowAnonymous_IsNeverPlacedOnAController_BecauseItWouldOverrideEveryActionAttribute()
    {
        // [AllowAnonymous] on a class beats [Authorize] on its actions - so a class-level one would
        // quietly expose actions that look protected.
        Assert.Empty(Controllers().Where(c => c.GetCustomAttributes<AllowAnonymousAttribute>().Any()).Select(c => c.Name));
    }

    [Fact]
    public void TheSetOfAnonymousActions_IsExactlyTheIntendedPublicSurface()
    {
        var anonymous = Controllers()
            .SelectMany(c => Actions(c).Where(a => a.GetCustomAttributes<AllowAnonymousAttribute>().Any()).Select(a => $"{c.Name}.{a.Name}"))
            .OrderBy(x => x)
            .ToList();

        var expected = new[]
        {
            "AuthController.Login", "AuthController.Logout", "AuthController.Refresh", "AuthController.Register",
            "CategoriesController.GetCategories",
            "MobileAuthController.Login", "MobileAuthController.Logout", "MobileAuthController.Refresh", "MobileAuthController.Register",
            "ProductsController.GetProduct", "ProductsController.GetProducts",
            "PromoBannersController.GetActive",
            "PromoCodesController.Validate",
            "ReviewsController.GetReviews", "ReviewsController.GetSummary",
        }.OrderBy(x => x).ToList();

        Assert.Equal(expected, anonymous);
    }

    [Theory]
    [InlineData(typeof(Api.Controllers.AuthController), "LogoutAll")]
    [InlineData(typeof(Api.Controllers.AuthController), "GetSessions")]
    [InlineData(typeof(Api.Controllers.AuthController), "RevokeSession")]
    [InlineData(typeof(Api.Controllers.OrdersController), "CreateOrder")]
    [InlineData(typeof(Api.Controllers.OrdersController), "GetOrders")]
    [InlineData(typeof(Api.Controllers.ReviewsController), "GetMine")]
    [InlineData(typeof(Api.Controllers.ReviewsController), "CreateReview")]
    [InlineData(typeof(Api.Controllers.ReviewsController), "DeleteMyReview")]
    public void SessionOrderAndReviewWriteActions_RequireASignedInUser(Type controller, string action)
    {
        var method = controller.GetMethod(action)!;
        var authorized = controller.GetCustomAttributes<AuthorizeAttribute>().Any() || method.GetCustomAttributes<AuthorizeAttribute>().Any();
        Assert.True(authorized, $"{controller.Name}.{action} must require authentication");
        Assert.False(method.GetCustomAttributes<AllowAnonymousAttribute>().Any());
    }

    [Fact]
    public void CookieBasedActions_AreGuardedAgainstCsrf()
    {
        foreach (var action in new[] { "Refresh", "Logout" })
        {
            var filters = typeof(Api.Controllers.AuthController).GetMethod(action)!
                .GetCustomAttributes<ServiceFilterAttribute>().Select(a => a.ServiceType);
            Assert.Contains(typeof(Api.Filters.CookieCsrfFilter), filters);
        }
    }
}
