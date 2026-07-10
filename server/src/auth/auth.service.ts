import prisma from "../config/prisma";

export class UserService{
    async findUserEmail(email:string){
        return prisma.user.findUnique({
            where:{
                email,
            },
        });
    }

    async createUser(data:{
        googleId:string;
        email:string;
        name:string;
        picture?:string;
    })
    {
            return prisma.user.create({
                data,
            });

    }

}