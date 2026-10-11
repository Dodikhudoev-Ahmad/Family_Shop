using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using NSubstitute;
using Xunit;
using Api.Common;
using Api.Controllers;
using Api.RateLimiting;
using Api.Security;
using Application.DTOs;
using Application.Interfaces;
using Application.Validators;

namespace Application.Tests.Security;

/// <summary>The four e-mail endpoints: public by design, own rate limits, answers that do not leak, secrets kept out of logs.</summary>
public class EmailFlowEndpointTests
{
    private static MethodInfo Action(string name) => typeof(AuthController).GetMethod(name)!;

    [Theory]
    [InlineData("ConfirmEmail", "email/confirm", RateLimitPolicies.AuthEmailLink)]
    [InlineData("ResendConfirmation", "email/resend", RateLimitPolicies.AuthEmail)]
    [InlineData("ForgotPassword", "password/forgot", RateLimitPolicies.AuthEmail)]
    [InlineData("ResetPassword", "password/reset", RateLimitPolicies.AuthEmailLink)]
    public void EachEndpoint_IsAnonymousPost_UnderItsOwnPolicy_AndNeverCached(string action, string route, string policy)
    {
        var method = Action(action);

        Assert.NotNull(method.GetCustomAttribute<AllowAnonymousAttribute>());
        Assert.Equal(route, method.GetCustomAttribute<HttpPostAttribute>()?.Template);
        Assert.Equal(policy, method.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName);
        Assert.True(typeof(AuthController).GetCustomAttribute<ResponseCacheAttribute>()!.NoStore); // Cache-Control: no-store
    }

    private static AuthController ControllerWith(IAccountEmailService emails)
    {
        var policy = new RefreshCookiePolicy(new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build(), Substitute.For<IWebHostEnvironment>());
        return new AuthController(Substitute.For<IAuthService>(), emails, policy)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
    }

    private static (int Status, ApiResponse<bool> Body) Unpack(IActionResult result)
    {
        var obj = Assert.IsAssignableFrom<ObjectResult>(result);
        return (obj.StatusCode ?? 200, Assert.IsType<ApiResponse<bool>>(obj.Value));
    }

    [Fact]
    public async Task ForgotAndResend_AlwaysAnswer200True_WhateverTheServiceDid()
    {
        var emails = Substitute.For<IAccountEmailService>();
        var controller = ControllerWith(emails);

        var forgot = Unpack(await controller.ForgotPassword(new ForgotPasswordRequestDto("known@example.com", "ru"), default));
        var forgotUnknown = Unpack(await controller.ForgotPassword(new ForgotPasswordRequestDto("nobody@example.com", "ru"), default));
        var resend = Unpack(await controller.ResendConfirmation(new ResendConfirmationRequestDto("known@example.com", "kk"), default));

        Assert.All(new[] { forgot, forgotUnknown, resend }, r =>
        {
            Assert.Equal(200, r.Status);
            Assert.True(r.Body.Success);
            Assert.Empty(r.Body.Errors);
            Assert.Null(r.Body.Code);
        });
        await emails.Received(1).RequestConfirmationAsync("known@example.com", "kk", Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(ConfirmEmailOutcome.Confirmed, 200)]
    [InlineData(ConfirmEmailOutcome.InvalidToken, 400)]
    public async Task Confirm_MapsItsOutcome(ConfirmEmailOutcome outcome, int status)
    {
        var emails = Substitute.For<IAccountEmailService>();
        emails.ConfirmEmailAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(outcome);

        var (code, body) = Unpack(await ControllerWith(emails).ConfirmEmail(new ConfirmEmailRequestDto("tok"), default));

        Assert.Equal(status, code);
        Assert.Equal(outcome == ConfirmEmailOutcome.InvalidToken ? "invalid_token" : null, body.Code);
    }

    [Theory]
    [InlineData(ResetPasswordOutcome.Reset, 200, null)]
    [InlineData(ResetPasswordOutcome.InvalidToken, 400, "invalid_token")]
    [InlineData(ResetPasswordOutcome.NotAllowed, 400, "password_is_email")]
    [InlineData(ResetPasswordOutcome.BreachedPassword, 400, "breached_password")]
    public async Task Reset_MapsItsOutcome(ResetPasswordOutcome outcome, int status, string? code)
    {
        var emails = Substitute.For<IAccountEmailService>();
        emails.ResetPasswordAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(outcome);

        var (actual, body) = Unpack(await ControllerWith(emails).ResetPassword(new ResetPasswordRequestDto("tok", "Brand-new-pw1"), default));

        Assert.Equal(status, actual);
        Assert.Equal(code, body.Code);
    }

    [Fact]
    public async Task AnInvalidTokenAnswer_IsIdenticalForUnknownUsedAndExpired()
    {
        // The service folds all three into one outcome, so the controller can only ever produce one body.
        var emails = Substitute.For<IAccountEmailService>();
        emails.ResetPasswordAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(ResetPasswordOutcome.InvalidToken);
        var controller = ControllerWith(emails);

        var a = Unpack(await controller.ResetPassword(new ResetPasswordRequestDto("unknown", "Brand-new-pw1"), default));
        var b = Unpack(await controller.ResetPassword(new ResetPasswordRequestDto("used", "Brand-new-pw1"), default));

        Assert.Equal(a.Body.Errors, b.Body.Errors);
        Assert.Equal(a.Status, b.Status);
    }

    // ---- input rules ----

    [Theory]
    [InlineData("", false)]
    [InlineData("short token with spaces", false)]
    [InlineData("<script>", false)]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", true)]
    public void TheToken_MustLookLikeOne(string token, bool valid)
    {
        Assert.Equal(valid, new ConfirmEmailRequestValidator().Validate(new ConfirmEmailRequestDto(token)).IsValid);
        Assert.Equal(valid, new ResetPasswordRequestValidator().Validate(new ResetPasswordRequestDto(token, "Brand-new-pw1")).IsValid);
    }

    [Fact]
    public void TheTokenIsCapped_SoNothingHugeReachesTheDatabase()
    {
        Assert.False(new ConfirmEmailRequestValidator().Validate(new ConfirmEmailRequestDto(new string('A', 129))).IsValid);
    }

    [Theory]
    [InlineData("short1", false)]            // too short
    [InlineData("onlyletters", false)]       // no digits
    [InlineData("12345678", false)]          // no letters
    [InlineData("password1", false)]         // common
    [InlineData("Tr1ckyTestValue", true)]
    public void TheNewPassword_FollowsTheRegistrationPolicy(string password, bool valid) =>
        Assert.Equal(valid, new ResetPasswordRequestValidator().Validate(new ResetPasswordRequestDto("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password)).IsValid);

    [Fact]
    public void TheNewPassword_IsLimitedToWhatBcryptKeeps()
    {
        var tooLong = "a1" + new string('x', 80);
        Assert.False(new ResetPasswordRequestValidator().Validate(new ResetPasswordRequestDto("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", tooLong)).IsValid);
    }

    [Fact]
    public void ForgotAndResend_NeedAWellFormedAddress()
    {
        Assert.False(new ForgotPasswordRequestValidator().Validate(new ForgotPasswordRequestDto("nope")).IsValid);
        Assert.True(new ForgotPasswordRequestValidator().Validate(new ForgotPasswordRequestDto("a@b.kz", "kk")).IsValid);
        Assert.False(new ResendConfirmationRequestValidator().Validate(new ResendConfirmationRequestDto("")).IsValid);
    }

    [Fact]
    public void TokensAndPasswords_NeverShowUpInToString()
    {
        Assert.DoesNotContain("super-secret-token", new ConfirmEmailRequestDto("super-secret-token").ToString());
        var reset = new ResetPasswordRequestDto("super-secret-token", "hunter2-secret").ToString();
        Assert.DoesNotContain("super-secret-token", reset);
        Assert.DoesNotContain("hunter2-secret", reset);
    }
}
