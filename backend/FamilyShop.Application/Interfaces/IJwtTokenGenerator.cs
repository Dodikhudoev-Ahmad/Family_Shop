using FamilyShop.Domain.Entities;

namespace FamilyShop.Application.Interfaces;

public interface IJwtTokenGenerator
{
    string GenerateAccessToken(User user);
    string GenerateRefreshToken();
}
