using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Api.Common;
using Api.Controllers;
using Api.Security;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Application.Services;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;
using Infrastructure;
using Infrastructure.Security;

namespace Application.Tests.Security;

/// <summary>The breached-password check as the owner switches it on (<c>Auth__BreachCheck</c>) and as the client sees it.</summary>
public class BreachCheckWiringTests
{
    private static IBreachedPasswordChecker Resolve(params (string Key, string Value)[] settings)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(settings.ToDictionary(s => s.Key, s => (string?)s.Value))
            .Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Substitute.For<Microsoft.Extensions.Hosting.IHostEnvironment>());
        services.AddInfrastructure(config);
        return services.BuildServiceProvider().GetRequiredService<IBreachedPasswordChecker>();
    }

    [Fact]
    public void ByDefault_TheCheckIsOff()
    {
        Assert.IsType<NoBreachedPasswordCheck>(Resolve(("ConnectionStrings:DefaultConnection", "Host=x")));
    }

    [Theory]
    [InlineData("true")]
    [InlineData("True")]
    public void WithAuthBreachCheckTrue_TheOnlineCheckIsUsed(string value)
    {
        Assert.IsType<HibpBreachedPasswordChecker>(Resolve(("ConnectionStrings:DefaultConnection", "Host=x"), ("Auth:BreachCheck", value)));
    }

    [Fact]
    public void WithAuthBreachCheckFalse_TheCheckStaysOff()
    {
        Assert.IsType<NoBreachedPasswordCheck>(Resolve(("ConnectionStrings:DefaultConnection", "Host=x"), ("Auth:BreachCheck", "false")));
    }

    [Fact]
    public void TheDefaultAddress_IsTheRangeApi_AndTheTimeoutIsTwoSeconds()
    {
        Assert.Equal("https://api.pwnedpasswords.com/range/", HibpBreachedPasswordChecker.DefaultRangeUrl);
        Assert.True(HibpBreachedPasswordChecker.Timeout <= TimeSpan.FromSeconds(2));
    }

    // ---- what the client receives ----

    [Fact]
    public async Task WebRegistration_WithABreachedPassword_Is400_WithTheMachineReadableCode()
    {
        var auth = Substitute.For<IAuthService>();
        auth.RegisterAsync(Arg.Any<RegisterRequestDto>(), Arg.Any<SessionContext>(), Arg.Any<CancellationToken>())
            .Returns(Result<AuthResult>.Failure("This password has appeared in a data breach - choose another one.", ResultErrorCodes.BreachedPassword));
        var controller = new AuthController(auth, Substitute.For<IAccountEmailService>(),
            new RefreshCookiePolicy(new ConfigurationBuilder().Build(), Substitute.For<IWebHostEnvironment>()))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };

        var action = await controller.Register(new RegisterRequestDto("a@b.kz", "Passw0rd1", "A"), default);

        var obj = Assert.IsType<BadRequestObjectResult>(action.Result);
        var body = Assert.IsType<ApiResponse<AuthResponseDto>>(obj.Value);
        Assert.Equal("breached_password", body.Code);
    }

    [Fact]
    public async Task MobileRegistration_WithABreachedPassword_Is400_WithTheCode()
    {
        var auth = Substitute.For<IAuthService>();
        auth.RegisterAsync(Arg.Any<RegisterRequestDto>(), Arg.Any<SessionContext>(), Arg.Any<CancellationToken>())
            .Returns(Result<AuthResult>.Failure("x", ResultErrorCodes.BreachedPassword));
        var controller = new MobileAuthController(auth);

        var action = await controller.Register(
            new MobileRegisterRequestDto("a@b.kz", "Passw0rd1", "A", "11111111-2222-3333-4444-555555555555", null), default);

        var obj = Assert.IsType<BadRequestObjectResult>(action.Result);
        Assert.Equal("breached_password", Assert.IsType<ApiResponse<MobileAuthResponseDto>>(obj.Value).Code);
    }

    [Fact]
    public async Task ChangingThePassword_ToABreachedOne_IsRefused_AndKeepsTheOldHash()
    {
        var uow = Substitute.For<IUnitOfWork>();
        var users = Substitute.For<IUserRepository>();
        uow.Users.Returns(users);
        var alice = new User { Id = 1, Email = new Email("alice@example.com"), Name = "A", PasswordHash = "hash-alice" };
        users.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(alice);
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Verify("alice-pw", "hash-alice").Returns(true);
        var checker = Substitute.For<IBreachedPasswordChecker>();
        checker.IsBreachedAsync("Passw0rd1", Arg.Any<CancellationToken>()).Returns(true);
        var sut = new AuthService(uow, hasher, Substitute.For<IJwtTokenGenerator>(), NullLogger<AuthService>.Instance, checker);

        var outcome = await sut.ChangePasswordAsync(1, "alice-pw", "Passw0rd1");

        Assert.Equal(ChangePasswordOutcome.BreachedPassword, outcome);
        Assert.Equal("hash-alice", alice.PasswordHash);
        hasher.DidNotReceive().Hash(Arg.Any<string>());
    }
}
