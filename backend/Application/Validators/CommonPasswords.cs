namespace Application.Validators;

/// <summary>
/// Offline list of the most common passwords (English, transliterated Russian/Kazakh, keyboard walks, shop-specific),
/// compared case-insensitively. It is a curated list, not a full breach database: the optional online check
/// (<c>Auth:BreachCheck</c>) covers the rest. Entries that the basic rules already refuse (shorter than 8 characters,
/// no digit) are not kept - they would never be reached.
/// </summary>
public static class CommonPasswords
{
    // Word + suffix combinations are the shape most real-world "strong-looking" weak passwords take.
    private static readonly string[] Words =
    {
        "password", "passw0rd", "p@ssw0rd", "p@ssword", "pass", "parol", "parole", "qwerty", "qwertyuiop", "qwerty123",
        "admin", "administrator", "root", "user", "guest", "login", "welcome", "letmein", "changeme", "secret", "master",
        "abc", "abcd", "abcde", "asdf", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "qazwsx", "qweasd", "qweasdzxc",
        "iloveyou", "ilovejesus", "love", "lovely", "monkey", "dragon", "sunshine", "princess", "football", "baseball",
        "basketball", "soccer", "hockey", "superman", "batman", "spiderman", "starwars", "pokemon", "naruto", "minecraft",
        "shadow", "michael", "jennifer", "jessica", "ashley", "daniel", "andrew", "joshua", "charlie", "thomas", "matthew",
        "hello", "hunter", "killer", "freedom", "whatever", "trustno", "access", "flower", "cheese", "summer", "winter",
        "spring", "autumn", "internet", "computer", "samsung", "iphone", "google", "facebook", "instagram", "telegram",
        "whatsapp", "mercedes", "bmw", "toyota", "ferrari", "porsche", "liverpool", "arsenal", "chelsea", "barcelona",
        "madrid", "realmadrid", "spartak", "zenit", "dinamo", "privet", "privet1", "zdravstvuy", "spasibo", "lyubov", "love",
        "natasha", "sasha", "dima", "dmitry", "alexey", "alexander", "sergey", "andrey", "maxim", "ivan", "anna", "olga",
        "elena", "irina", "svetlana", "marina", "ahmad", "ahmed", "muhammad", "mohammed", "aisha", "aigerim", "aliya",
        "dana", "madina", "arman", "nurlan", "serik", "bakhyt", "kazakhstan", "qazaqstan", "almaty", "astana", "shymkent",
        "karaganda", "aktobe", "taraz", "tajikistan", "dushanbe", "uzbekistan", "tashkent", "bishkek", "kyrgyzstan",
        "russia", "moscow", "ukraine", "belarus", "minsk", "kz", "familyshop", "family", "shop", "familyshop10", "magazin",
        "marketplace", "store", "qwe", "zaq", "xsw", "cde", "vfr", "bgt", "nhy", "mju", "ilove", "mypassword", "mypass",
        "test", "testing", "tester", "demo", "sample", "default", "temp", "temporary", "company", "business", "money",
        "dollar", "tenge", "bitcoin", "crypto", "gold", "silver", "diamond", "tiger", "lion", "eagle", "wolf", "bear",
        "cookie", "banana", "orange", "apple", "cherry", "lemon", "pepper", "coffee", "chocolate", "butterfly",
        "rainbow", "starlight", "moonlight", "sunflower", "angel", "devil", "ninja", "samurai", "warrior", "pirate",
    };

    private static readonly string[] Suffixes =
    {
        "1", "2", "3", "7", "11", "12", "13", "21", "22", "69", "77", "88", "99", "007", "123", "321", "234", "456",
        "1234", "4321", "12345", "123456", "1234567", "12345678", "111", "222", "333", "555", "666", "777", "000",
        "2020", "2021", "2022", "2023", "2024", "2025", "2026", "1990", "1995", "2000", "2005", "2010",
        "1!", "12!", "123!", "1234!", "@1", "@12", "@123", "@1234", "#1", "#123", "!1", "!123", "1@", "123@", "1#", "123#",
    };

    private static readonly string[] Standalone =
    {
        // digits and number patterns that are long enough to be accepted by the length rule
        "12345678", "123456789", "1234567890", "12345678910", "0123456789", "987654321", "9876543210", "11111111",
        "111111111", "1111111111", "00000000", "000000000", "12341234", "123123123", "1231231234", "87654321",
        "11223344", "112233445566", "123321123", "147258369", "159357852", "741852963", "789456123", "123654789",
        "321654987", "135792468", "24681012", "10203040", "1020304050", "55555555", "66666666", "77777777", "88888888",
        "99999999", "12121212", "13131313", "14141414", "21212121", "69696969", "20202020", "19901990", "19951995",
        // keyboard walks
        "1q2w3e4r", "1q2w3e4r5t", "1q2w3e4r5t6y", "1qaz2wsx", "1qaz2wsx3edc", "1qazxsw2", "1qaz@wsx", "zaq12wsx",
        "zaq1zaq1", "zaq1xsw2", "xsw21qaz", "qazwsx123", "qazwsxedc", "q1w2e3r4", "q1w2e3r4t5", "q1w2e3r4t5y6",
        "qwe12345", "qwe123456", "qweqwe123", "qwerty12", "qwerty1234", "qwerty12345", "qwerty123456", "qwerty1!",
        "qwer1234", "qwer4321", "asd12345", "asdf1234", "asdf12345", "asdfasdf1", "asdasd123", "zxc12345", "zxcvbnm1",
        "zxcvbnm123", "a1b2c3d4", "a1b2c3d4e5", "a1s2d3f4", "z1x2c3v4", "abc12345", "abcd1234", "abcd12345",
        "abc123456", "abcd123456", "abcdef123", "abcdefg1", "abcdefg123", "aa123456", "aaa11111", "aaaa1111", "aa12345678",
        // transliterated Russian layouts and words
        "йцукен123", "йцукен12", "йцукенг1", "пароль123", "пароль12", "пароль1234", "привет123",
        "привет12", "люблю123", "ghbdtn123", "ghbdtn12", "ghbdtngjrf", "gfhjkm123", "gfhjkm12", "lbvf12345", "cfif12345",
        // common phrases
        "iloveyou1", "iloveyou12", "iloveyou123", "ilovemom1", "ilovemom123", "ilovedad1", "loveyou123", "loveme123",
        "trustno1", "trustno123", "letmein1", "letmein12", "letmein123", "welcome1", "welcome12", "welcome123",
        "welcome1234", "changeme1", "changeme12", "changeme123", "newpass12", "newpass123", "newpassword1", "mypass123",
        "mypassword1", "mypassword123", "secret123", "secret1234", "master123", "master1234", "access123", "freedom1",
        "hello123", "hello1234", "hello12345", "hellohello1", "test1234", "test12345", "test123456", "testtest1",
        "admin123", "admin1234", "admin12345", "admin123456", "admin1admin", "admin@123", "admin@1234", "adminadmin1",
        "root1234", "root12345", "user1234", "user12345", "guest123", "guest1234", "demo1234", "demo12345",
        "football1", "football12", "football123", "baseball1", "baseball123", "dragon123", "dragon1234", "monkey123",
        "monkey1234", "sunshine1", "sunshine12", "sunshine123", "princess1", "princess12", "princess123", "superman1",
        "superman123", "batman123", "batman1234", "shadow123", "shadow1234", "michael1", "michael123", "jennifer1",
        "jessica1", "ashley123", "daniel123", "andrew123", "charlie123", "thomas123", "matthew1", "joshua123",
        // shop-specific
        "familyshop1", "familyshop12", "familyshop123", "familyshop1234", "familyshop10", "familyshop2026",
        "familyshop@123", "family123", "family1234", "shop12345", "shop123456", "magazin123", "kazakhstan1",
        "kazakhstan123", "kazakhstan2026", "almaty123", "almaty1234", "astana123", "astana1234", "qazaqstan1",
    };

    /// <summary>The whole list, lower-case, each one satisfying the basic length and letter+digit rules.</summary>
    public static readonly IReadOnlySet<string> All = Build();

    private static HashSet<string> Build()
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string candidate)
        {
            // Anything the basic rules already reject never needs to be remembered here.
            if (candidate.Length >= 8 && candidate.Any(char.IsLetter) && candidate.Any(char.IsDigit))
            {
                set.Add(candidate);
            }
        }

        foreach (var word in Standalone)
        {
            Add(word);
        }

        foreach (var word in Words)
        {
            foreach (var suffix in Suffixes)
            {
                Add(word + suffix);
            }
        }

        return set;
    }
}
