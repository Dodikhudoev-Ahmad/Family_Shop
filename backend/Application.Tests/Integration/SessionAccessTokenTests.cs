using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using NSubstitute;
using Xunit;
using Api.Security;
using Application.Common;
using Application.Interfaces;
using Application.Services;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Security;

namespace Application.Tests.Integration;

/// <summary>
/// An access token stops working as soon as its session is revoked, not 15 minutes later. Real PostgreSQL, real
/// <see cref="AuthService"/>, real <see cref="JwtTokenGenerator"/> and the real <see cref="ActiveAccountTokenValidator"/>
/// fed with the principal the JwtBearer handler would build; a failed validation is what the pipeline turns into 401.
/// </summary>
public class SessionAccessTokenTests : IClassFixture<PostgresFixture>
{
    private const string Device = "11111111-2222-3333-4444-555555555555";

    private static readonly JwtSettings Settings = new()
    {
        SecretKey = NewKey(),
        Issuer = "test-issuer",
        Audience = "test-audience"
    };

    /// <summary>Random per test run, so no key value lives in the repository.</summary>
    private static string NewKey() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));

    private readonly PostgresFixture _db;

    public SessionAccessTokenTests(PostgresFixture db) => _db = db;

    // ---------- helpers ----------

    private async Task<int> NewUserAsync(UserRole role = UserRole.Customer)
    {
        await using var ctx = _db.CreateContext();
        var user = new User { Email = new Email($"u{Guid.NewGuid():N}@example.com"), Name = "Test", PasswordHash = "x", Role = role };
        ctx.Add(user);
        await ctx.SaveChangesAsync();
        return user.Id;
    }

    private AuthService Auth(AppDbContext ctx)
    {
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(true);
        return new AuthService(new UnitOfWork(ctx), hasher, new JwtTokenGenerator(Options.Create(Settings)), NullLogger<AuthService>.Instance);
    }

    private async Task<(string Access, string Refresh)> LoginAsync(int userId, SessionContext session)
    {
        await using var ctx = _db.CreateContext();
        var email = (await ctx.Set<User>().AsNoTracking().SingleAsync(u => u.Id == userId)).Email.Value;
        var result = await Auth(ctx).LoginAsync(new(email, "pw"), session);
        Assert.True(result.IsSuccess);
        return (result.Value!.Response.AccessToken, result.Value.RefreshToken);
    }

    /// <summary>The principal JwtBearer builds from a token (same signature, issuer, audience and claim mapping).</summary>
    private static ClaimsPrincipal PrincipalOf(string accessToken) =>
        new JwtSecurityTokenHandler().ValidateToken(accessToken, new TokenValidationParameters
        {
            ValidIssuer = Settings.Issuer,
            ValidAudience = Settings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Settings.SecretKey))
        }, out _);

    /// <summary>True when the request would be let through; false means the pipeline answers 401.</summary>
    private async Task<bool> IsAcceptedAsync(string accessToken)
    {
        await using var ctx = _db.CreateContext();
        var services = new ServiceCollection().AddSingleton<Domain.Interfaces.IUnitOfWork>(new UnitOfWork(ctx)).BuildServiceProvider();
        var http = new DefaultHttpContext { RequestServices = services };
        var context = new TokenValidatedContext(http, new AuthenticationScheme("Bearer", null, typeof(JwtBearerHandler)), new JwtBearerOptions())
        {
            Principal = PrincipalOf(accessToken)
        };

        await ActiveAccountTokenValidator.ValidateAsync(context);

        return context.Result?.Failure is null;
    }

    private async Task<Guid> FamilyOfAsync(string refreshToken)
    {
        await using var ctx = _db.CreateContext();
        var hash = TokenHasher.Hash(refreshToken);
        return await ctx.Set<RefreshToken>().Where(t => t.TokenHash == hash).Select(t => t.FamilyId).SingleAsync();
    }

    // ---------- tests ----------

    [PostgresFact]
    public async Task ALiveSessionsToken_IsAccepted()
    {
        var user = await NewUserAsync();
        var (access, _) = await LoginAsync(user, SessionContext.Web);

        Assert.True(await IsAcceptedAsync(access));
    }

    [PostgresFact]
    public async Task AfterLogout_TheOldAccessTokenIsRejected_AndANewLoginWorks()
    {
        var user = await NewUserAsync();
        var (oldAccess, refresh) = await LoginAsync(user, SessionContext.Web);

        await using (var ctx = _db.CreateContext())
        {
            await Auth(ctx).RevokeRefreshTokenAsync(refresh, SessionContext.Web);
        }

        Assert.False(await IsAcceptedAsync(oldAccess));

        var (newAccess, _) = await LoginAsync(user, SessionContext.Web);
        Assert.True(await IsAcceptedAsync(newAccess));
        Assert.False(await IsAcceptedAsync(oldAccess)); // still dead
    }

    [PostgresFact]
    public async Task AfterLogoutOnMobile_TheOldAccessTokenIsRejected()
    {
        var user = await NewUserAsync();
        var phone = new SessionContext(ClientType.Mobile, Device, "Pixel 8");
        var (oldAccess, refresh) = await LoginAsync(user, phone);

        await using (var ctx = _db.CreateContext())
        {
            await Auth(ctx).RevokeRefreshTokenAsync(refresh, phone);
        }

        Assert.False(await IsAcceptedAsync(oldAccess));
    }

    [PostgresFact]
    public async Task LogoutAll_RejectsEveryTokenOfThatUser_ButNotOfAnotherUser()
    {
        var alice = await NewUserAsync();
        var bob = await NewUserAsync();
        var (aliceWeb, _) = await LoginAsync(alice, SessionContext.Web);
        var (alicePhone, _) = await LoginAsync(alice, new SessionContext(ClientType.Mobile, Device, "Pixel 8"));
        var (bobWeb, _) = await LoginAsync(bob, SessionContext.Web);

        await using (var ctx = _db.CreateContext())
        {
            await Auth(ctx).LogoutAllAsync(alice); // also what an admin's revoke-sessions and a future password change call
        }

        Assert.False(await IsAcceptedAsync(aliceWeb));
        Assert.False(await IsAcceptedAsync(alicePhone));
        Assert.True(await IsAcceptedAsync(bobWeb));
    }

    [PostgresFact]
    public async Task RevokingOneDevice_RejectsOnlyThatDevicesToken()
    {
        var user = await NewUserAsync();
        var (webAccess, webRefresh) = await LoginAsync(user, SessionContext.Web);
        var (phoneAccess, _) = await LoginAsync(user, new SessionContext(ClientType.Mobile, Device, "Pixel 8"));

        await using (var ctx = _db.CreateContext())
        {
            var revoked = await Auth(ctx).RevokeSessionAsync(user, await FamilyOfAsync(webRefresh));
            Assert.True(revoked.IsSuccess);
        }

        Assert.False(await IsAcceptedAsync(webAccess));
        Assert.True(await IsAcceptedAsync(phoneAccess));
    }

    [PostgresFact]
    public async Task RefreshRotation_KeepsTheSessionAlive_BothTheOldAndTheNewAccessTokenWork()
    {
        var user = await NewUserAsync();
        var (oldAccess, refresh) = await LoginAsync(user, SessionContext.Web);

        string newAccess;
        await using (var ctx = _db.CreateContext())
        {
            var rotated = await Auth(ctx).RefreshAsync(refresh, SessionContext.Web);
            Assert.True(rotated.IsSuccess);
            newAccess = rotated.Value!.Response.AccessToken;
        }

        Assert.True(await IsAcceptedAsync(newAccess));
        Assert.True(await IsAcceptedAsync(oldAccess)); // same family, still alive until its own 15 minutes run out

        // A replay of the old refresh token inside the race window is refused but burns nothing.
        await using (var ctx = _db.CreateContext())
        {
            Assert.False((await Auth(ctx).RefreshAsync(refresh, SessionContext.Web)).IsSuccess);
        }

        Assert.True(await IsAcceptedAsync(newAccess));
    }

    [PostgresFact]
    public async Task ReplayOfARotatedRefreshToken_BurnsTheSession_AndItsAccessTokensStopWorking()
    {
        var user = await NewUserAsync();
        var (_, refresh) = await LoginAsync(user, SessionContext.Web);

        string newAccess;
        await using (var ctx = _db.CreateContext())
        {
            newAccess = (await Auth(ctx).RefreshAsync(refresh, SessionContext.Web)).Value!.Response.AccessToken;
        }

        Assert.True(await IsAcceptedAsync(newAccess));

        // Push the rotation past the benign-race window, then replay the old token as a thief would.
        var hash = TokenHasher.Hash(refresh);
        await using (var ctx = _db.CreateContext())
        {
            await ctx.Set<RefreshToken>().Where(t => t.TokenHash == hash)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RotatedAt, DateTime.UtcNow.AddMinutes(-5)));
            Assert.False((await Auth(ctx).RefreshAsync(refresh, SessionContext.Web)).IsSuccess);
        }

        Assert.False(await IsAcceptedAsync(newAccess));
    }

    [PostgresFact]
    public async Task ASessionPastItsIdleOrAbsoluteExpiry_IsRejected()
    {
        var user = await NewUserAsync();
        var (access, refresh) = await LoginAsync(user, SessionContext.Web);
        var hash = TokenHasher.Hash(refresh);

        await using var ctx = _db.CreateContext();
        await ctx.Set<RefreshToken>().Where(t => t.TokenHash == hash)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.ExpiresAt, DateTime.UtcNow.AddMinutes(-1)));

        Assert.False(await IsAcceptedAsync(access));
    }

    [PostgresFact]
    public async Task ATokenWhoseSessionBelongsToAnotherUser_IsRejected()
    {
        var alice = await NewUserAsync();
        var bob = await NewUserAsync();
        var (_, bobRefresh) = await LoginAsync(bob, SessionContext.Web);
        var bobFamily = await FamilyOfAsync(bobRefresh);

        // A token for Alice that claims Bob's (live) session id must not ride on it.
        await using var ctx = _db.CreateContext();
        var aliceUser = await ctx.Set<User>().AsNoTracking().SingleAsync(u => u.Id == alice);
        var forged = new JwtTokenGenerator(Options.Create(Settings)).GenerateAccessToken(aliceUser, bobFamily);

        Assert.False(await IsAcceptedAsync(forged));
    }

    [PostgresFact]
    public async Task ATokenWithoutASessionClaim_IsRejected()
    {
        var user = await NewUserAsync();
        var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.ToString()), new Claim(ClaimTypes.Role, "Customer") };
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            Settings.Issuer, Settings.Audience, claims, expires: DateTime.UtcNow.AddMinutes(15),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Settings.SecretKey)), SecurityAlgorithms.HmacSha256)));

        Assert.False(await IsAcceptedAsync(token));
    }

    [PostgresFact]
    public async Task DeletingTheAccount_RejectsItsAccessToken()
    {
        var user = await NewUserAsync();
        var (access, _) = await LoginAsync(user, SessionContext.Web);

        await using (var ctx = _db.CreateContext())
        {
            await ctx.Set<RefreshToken>().Where(t => t.UserId == user).ExecuteDeleteAsync(); // what account deletion does to sessions
        }

        Assert.False(await IsAcceptedAsync(access));
    }

    [PostgresFact]
    public async Task Roles_AreUntouched_AdminKeepsTheAdminClaimAndCustomerDoesNot()
    {
        var admin = await NewUserAsync(UserRole.Admin);
        var customer = await NewUserAsync();
        var (adminAccess, _) = await LoginAsync(admin, SessionContext.Web);
        var (customerAccess, _) = await LoginAsync(customer, SessionContext.Web);

        Assert.True(await IsAcceptedAsync(adminAccess));
        Assert.True(await IsAcceptedAsync(customerAccess));
        Assert.True(PrincipalOf(adminAccess).IsInRole("Admin"));
        Assert.False(PrincipalOf(customerAccess).IsInRole("Admin"));
        Assert.True(PrincipalOf(customerAccess).IsInRole("Customer"));
    }
}
