import prisma from "../config/prisma";


export interface FindOrCreateAccountInput {
    provider: string;
    providerUserId: string;
    email: string;
    name: string;
}

class AuthService {
    async findOrCreateAccount(data: FindOrCreateAccountInput) {

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
            return existingAccount.user;
        }

        // Create new user with linked connected account
        const newUser = await prisma.user.create({
            data: {
                email: data.email,
                name: data.name,
                accounts: {
                    create: {
                        provider: data.provider,
                        providerUserId: data.providerUserId,
                    },
                },
            },
        });

        return newUser;
    }

}

export const authService = new AuthService()
