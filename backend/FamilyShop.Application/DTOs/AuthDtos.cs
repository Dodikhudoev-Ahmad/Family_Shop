namespace FamilyShop.Application.DTOs;

public record RegisterRequestDto(string Email, string Password, string Name);

public record LoginRequestDto(string Email, string Password);

public record AuthResponseDto(int UserId, string Email, string Name, string AccessToken);

public record AuthResult(AuthResponseDto Response, string RefreshToken);
