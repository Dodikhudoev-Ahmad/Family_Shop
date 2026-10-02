using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Xunit;
using Api.Controllers;
using Api.RateLimiting;
using Api.Security;
using Application.DTOs;
using Application.Interfaces;
using Application.Validators;
using Domain.Interfaces;

namespace Application.Tests.Security;

public class AccountDeletionEndpointTests
{
    private static readonly MethodInfo Action = typeof(AuthController).GetMethod(nameof(AuthController.DeleteAccount))!;

    [Fact]
    public void Deleting_RequiresASignedInUser_AndSitsUnderTheStrictLoginLimit()
    {
        Assert.NotNull(Action.GetCustomAttribute<AuthorizeAttribute>());
        Assert.Null(Action.GetCustomAttribute<AllowAnonymousAttribute>());
        Assert.Equal(RateLimitPolicies.Auth, Action.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName);
        Assert.Equal("me", Action.GetCustomAttribute<HttpDeleteAttribute>()?.Template);
    }

    [Fact]
    public void TheAccountToDelete_CanNeverBeChosenByTheCaller()
    {
        // Only the request body (the password) and a cancellation token: no id in the route, query or body.
        var parameters = Action.GetParameters().Select(p => p.ParameterType).ToArray();
        Assert.Equal(new[] { typeof(DeleteAccountRequestDto), typeof(CancellationToken) }, parameters);
        Assert.Equal(new[] { "Password" }, typeof(DeleteAccountRequestDto).GetProperties().Select(p => p.Name).ToArray());
    }

    [Fact]
    public void ThePasswordIsRequired_AndNeverPrintedInLogs()
    {
        var validator = new DeleteAccountRequestValidator();
        Assert.False(validator.Validate(new DeleteAccountRequestDto("")).IsValid);
        Assert.False(validator.Validate(new DeleteAccountRequestDto(new string('x', 1025))).IsValid);
        Assert.True(validator.Validate(new DeleteAccountRequestDto("secret-pw")).IsValid);
        Assert.DoesNotContain("secret-pw", new DeleteAccountRequestDto("secret-pw").ToString());
    }

    private static AuthController ControllerFor(IAuthService service, int userId)
    {
        var controller = new AuthController(service, Substitute.For<IWebHostEnvironment>());
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, userId.ToString()) }, "test"))
        };
        controller.ControllerContext = new ControllerContext { HttpContext = http };
        return controller;
    }

    [Theory]
    [InlineData(DeleteAccountOutcome.Deleted, 204)]
    [InlineData(DeleteAccountOutcome.InvalidPassword, 400)]   // not 401: the app would think its session died
    [InlineData(DeleteAccountOutcome.NotAllowed, 403)]
    [InlineData(DeleteAccountOutcome.ActiveOrders, 409)]
    [InlineData(DeleteAccountOutcome.NotFound, 404)]
    public async Task EachOutcome_MapsToItsHttpStatus_UsingOnlyTheIdFromTheToken(DeleteAccountOutcome outcome, int status)
    {
        var service = Substitute.For<IAuthService>();
        service.DeleteAccountAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(outcome);

        var result = await ControllerFor(service, userId: 7).DeleteAccount(new DeleteAccountRequestDto("pw"), CancellationToken.None);

        Assert.Equal(status, ((IStatusCodeActionResult)result).StatusCode);
        await service.Received(1).DeleteAccountAsync(7, "pw", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ActiveOrders_AnswersConflict_WithTheCode_active_orders()
    {
        var service = Substitute.For<IAuthService>();
        service.DeleteAccountAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(DeleteAccountOutcome.ActiveOrders);

        var result = await ControllerFor(service, userId: 7).DeleteAccount(new DeleteAccountRequestDto("pw"), CancellationToken.None);

        var body = Assert.IsType<Api.Common.ApiResponse<bool>>(((ObjectResult)result).Value);
        Assert.Equal(new[] { "active_orders" }, body.Errors);
    }

    // ---- the access token of a deleted account stops working at once ----

    private static TokenValidatedContext ContextFor(ClaimsPrincipal principal, IUnitOfWork unitOfWork)
    {
        var services = new ServiceCollection().AddSingleton(unitOfWork).BuildServiceProvider();
        var http = new DefaultHttpContext { RequestServices = services };
        return new TokenValidatedContext(http, new AuthenticationScheme("Bearer", null, typeof(JwtBearerHandler)), new JwtBearerOptions())
        {
            Principal = principal
        };
    }

    private static ClaimsPrincipal Subject(string? id) =>
        new(new ClaimsIdentity(id is null ? Array.Empty<Claim>() : new[] { new Claim(ClaimTypes.NameIdentifier, id) }, "test"));

    [Fact]
    public async Task ATokenOfADeletedAccount_IsRejected()
    {
        var users = Substitute.For<IUserRepository>();
        users.IsActiveAsync(5, Arg.Any<CancellationToken>()).Returns(false);
        var uow = Substitute.For<IUnitOfWork>();
        uow.Users.Returns(users);
        var context = ContextFor(Subject("5"), uow);

        await ActiveAccountTokenValidator.ValidateAsync(context);

        Assert.NotNull(context.Result?.Failure);
    }

    [Fact]
    public async Task ATokenOfALiveAccount_PassesThrough()
    {
        var users = Substitute.For<IUserRepository>();
        users.IsActiveAsync(5, Arg.Any<CancellationToken>()).Returns(true);
        var uow = Substitute.For<IUnitOfWork>();
        uow.Users.Returns(users);
        var context = ContextFor(Subject("5"), uow);

        await ActiveAccountTokenValidator.ValidateAsync(context);

        Assert.Null(context.Result);
    }

    [Fact]
    public async Task ATokenWithoutAValidSubject_IsRejected_WithoutTouchingTheDatabase()
    {
        var uow = Substitute.For<IUnitOfWork>();
        var context = ContextFor(Subject("not-a-number"), uow);

        await ActiveAccountTokenValidator.ValidateAsync(context);

        Assert.NotNull(context.Result?.Failure);
        Assert.Empty(uow.ReceivedCalls());
    }
}
