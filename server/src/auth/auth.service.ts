import prisma from "../config/prisma";


export interface FindOrCreateAccountInput {
    provider: string;
    providerUserId: string;
    email: string;
    name: string;

    accessToken: string;
    refreshToken?: string;
}

class AuthService {
   async findOrCreateAccount(data: FindOrCreateAccountInput) {
    console.log("===== AUTH SERVICE =====");
console.log("Access Token:", data.accessToken);
console.log("Refresh Token:", data.refreshToken);

    const existingAccount = await prisma.connectedAccount.findUnique({
        where: {
            provider_providerUserId: {
                provider: data.provider,
                providerUserId: data.providerUserId,
            },
        },
        include: {
            user: true,
        },
    });

    if (existingAccount) {

        await prisma.connectedAccount.update({
            where: {
                provider_providerUserId: {
                    provider: data.provider,
                    providerUserId: data.providerUserId,
                },
            },
            data: {
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
            },
        });

        return existingAccount.user;
    }

    return prisma.user.create({
        data: {
            email: data.email,
            name: data.name,
            accounts: {
                create: {
                    provider: data.provider,
                    providerUserId: data.providerUserId,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                },
            },
        },
    });
}

}

export const authService = new AuthService()
